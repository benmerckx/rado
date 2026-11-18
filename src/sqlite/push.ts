import type {Database} from '../core/Database.ts'
import {getData} from '../core/Internal.ts'
import {
  type Gen,
  type Push,
  type PushOptions,
  type Runner,
  type Step,
  type TableInfo,
  columns,
  compare,
  createPush,
  differ,
  exists,
  foreignKeyChanges,
  renameColumn,
  renameSteps,
  scratch,
  within
} from '../core/Push.ts'
import {type Sql, sql} from '../core/Sql.ts'
import type {TableApi} from '../core/Table.ts'
import {type SchemaRow, inspect, prefix, schema} from './inspect.ts'

export type {PushInput, PushOptions} from '../core/Push.ts'

const {entries, keys, values} = Object
const constant = /^(null|true|false|[-+\d.e]+|x?'([^']|'')*')$/i

// https://www.sqlite.org/datatype3.html#determination_of_column_affinity
function affinity(type: string): string {
  if (type.includes('int')) return 'integer'
  if (/char|clob|text/.test(type)) return 'text'
  if (!type || type.includes('blob')) return 'blob'
  if (/real|floa|doub/.test(type)) return 'real'
  return 'numeric'
}

// Values are copied as they are, so only a change of affinity can alter them
const widens = (from: string, to: string) => affinity(from) === affinity(to)

function* plan(
  tx: Database,
  api: TableApi,
  options: PushOptions
): Gen<Array<Step>> {
  const before = yield* inspect(tx, api.name)
  if (!before) return api.create().map(sql => ({sql}))
  const renamed = renameSteps(api, before, options).map(pair =>
    renameColumn(api.identifier(), pair)
  )
  return yield* scratch(tx, function* (sp) {
    for (const step of renamed) yield sp.run(step.sql)
    const live = renamed.length > 0 ? (yield* inspect(sp, api.name))! : before
    // Sqlite accepts foreign keys to missing tables, the copy keeps them
    const copy = prefix + api.name
    yield sp.run(api.createTable(copy))
    for (const [name, index] of entries(api.indexes()))
      yield sp.run(getData(index).toSql(copy, prefix + name, false))
    const desired = (yield* inspect(sp, copy, true))!
    return [...renamed, ...(yield* changes(sp, api, live, desired))]
  })
}

function* changes(
  tx: Database,
  api: TableApi,
  live: TableInfo,
  desired: TableInfo
): Gen<Array<Step>> {
  const target = api.identifier()
  const data = columns(api)
  const fks = foreignKeyChanges(api, live)
  const {hasRows, dropped, added, changed, risks, nulls} = yield* compare(
    tx,
    target,
    api.name,
    live,
    desired,
    widens
  )
  const rows = yield* hasRows()
  const sorted = (info: TableInfo) => values(info.constraints).toSorted().join()
  // What alter table add column accepts
  const addable = (name: string) => {
    const column = desired.columns[name]
    return (
      !(column.notNull && column.default === null) &&
      !(rows && column.default && !constant.test(column.default)) &&
      !fks.added.some(fk => fk.columns.includes(name) && column.default)
    )
  }
  if (
    changed.length > 0 ||
    fks.dropped.length > 0 ||
    sorted(live) !== sorted(desired) ||
    fks.added.some(fk => !fk.inline || !added.includes(fk.columns[0])) ||
    !added.every(addable)
  )
    return yield* recreate(
      tx,
      api,
      live,
      desired,
      values({...risks, ...nulls})[0]
    )

  const indexes = api.indexes()
  return [
    ...differ(live.indexes, desired.indexes).map(name => ({
      sql: sql`drop index ${sql.identifier(name)}`
    })),
    // Added first, a table can't lose its last column
    ...added.map(name => ({
      sql: sql`alter table ${target} add column ${api.columnDefinition(
        data[name].key
      )}`
    })),
    ...dropped.map(name => ({
      sql: sql`alter table ${target} drop column ${sql.identifier(name)}`,
      risk: risks[name]
    })),
    ...differ(desired.indexes, live.indexes).map(name => ({
      sql: getData(indexes[name]).toSql(api.name, name, false)
    }))
  ]
}

// https://www.sqlite.org/lang_altertable.html#otheralter
function* recreate(
  tx: Database,
  api: TableApi,
  live: TableInfo,
  desired: TableInfo,
  risk?: string
): Gen<Array<Step>> {
  const target = api.identifier()
  const name = sql.inline(api.name)
  const temp = sql.identifier(prefix + api.name)
  const data = columns(api)
  const rowid = live.rowid !== false
  // Dropping the table drops its triggers, views are dropped as well since
  // they may use it, and with them their instead of triggers
  const kept: Array<SchemaRow> = yield schema(
    tx,
    sql`type = 'view' or type = 'trigger' and (tbl_name = ${name} or tbl_name in (select name from sqlite_master where type = 'view'))`
  )
  const autoIncrement = (info: TableInfo) =>
    values(info.columns).some(column => column.extra)
  // Read as text, a counter can be larger than a JavaScript number holds
  const sequence: {seq: string} | null =
    autoIncrement(live) && autoIncrement(desired)
      ? yield tx.get(
          sql`select cast(seq as text) as seq from sqlite_sequence where name = ${name}`
        )
      : null
  const copied = keys(desired.columns).filter(name => live.columns[name])
  if (!rowid && copied.length === 0)
    throw new Error(`Cannot rebuild "${api.name}" without a column to copy`)
  // Rowids are copied so they keep their values, through a name no column
  // shadows on either side, unless a copied column becomes the rowid
  const free = (info: TableInfo) =>
    ['rowid', '_rowid_', 'oid'].find(
      alias => !keys(info.columns).some(name => name.toLowerCase() === alias)
    )
  const from = free(live)
  const into = free(desired)
  const alias = desired.rowid as string
  const promoted = copied.includes(alias)
  if (rowid && !(from && (into || promoted)))
    throw new Error(`Cannot rebuild "${api.name}", its columns hide the rowid`)
  if (
    rowid &&
    promoted &&
    alias !== live.rowid &&
    (yield* exists(
      tx,
      target,
      sql`${sql.identifier(alias)} is not ${sql.identifier(from!)}`
    ))
  )
    risk ??= `change the rowids of "${api.name}" to "${alias}"`
  const ids = rowid && !promoted
  const names = [...(ids ? [into!] : []), ...copied]
  const selection = [...(ids ? [from!] : []), ...copied].map(name => {
    const to = desired.columns[name]
    const fallback = data[name]?.defaultValue
    const value = sql.identifier(name)
    return to?.notNull && !live.columns[name].notNull && fallback
      ? sql`coalesce(${value}, ${fallback})`.inlineValues()
      : value
  })
  return [
    ...kept
      .filter(row => row.type === 'view')
      .map(view => ({sql: sql`drop view ${sql.identifier(view.name)}`})),
    {sql: api.createTable(prefix + api.name)},
    {
      sql: sql`insert into ${temp} (${sql.join(
        names.map(sql.identifier),
        sql`, `
      )}) select ${sql.join(selection, sql`, `)} from ${target}`
    },
    // The old table goes with any data the copy leaves out
    {sql: sql`drop table ${target}`, risk, rebuild: true},
    {sql: sql`alter table ${temp} rename to ${sql.identifier(api.name)}`},
    ...(sequence
      ? [
          {sql: sql`delete from sqlite_sequence where name = ${name}`},
          {
            sql: sql`insert into sqlite_sequence (name, seq) values (${name}, cast(${sql.inline(
              sequence.seq
            )} as integer))`
          }
        ]
      : []),
    ...api.createIndexes().map(sql => ({sql})),
    ...kept.map(row => ({sql: sql.unsafe(row.sql!)}))
  ]
}

function* enforced(db: Database): Gen<boolean> {
  const row: {foreign_keys: number} = yield db.get(sql`pragma foreign_keys`)
  return Boolean(row?.foreign_keys)
}

// The foreign_keys pragma is a no-op inside a transaction, so it is turned
// off around it and the keys are checked before commit. An immediate
// transaction keeps writers out between the data checks and the changes.
// A malformed foreign key, anywhere, makes the check itself fail
function* violations(tx: Database, failure: string): Gen<Array<string>> {
  try {
    const rows: Array<object> = yield tx.all(sql`pragma foreign_key_check`)
    return rows.map(row => values(row).join())
  } catch (error) {
    throw new Error(`${failure}: ${(error as Error).message}`, {cause: error})
  }
}

const runner: Runner = function* (db, apply, dry) {
  const on = yield* enforced(db)
  if (on) yield db.run(sql`pragma foreign_keys = off`)
  try {
    return yield* within(
      db,
      function* (tx) {
        const locked = on && (yield* enforced(tx))
        // Checked whether or not keys are enforced, and only what the push
        // breaks fails it, so existing orphans elsewhere don't block it
        const before = yield* violations(tx, 'Cannot check foreign keys')
        const result = yield* apply(tx, true, steps => {
          if (locked && steps.some(step => step.rebuild))
            throw new Error('Cannot rebuild with foreign keys enforced')
        })
        // Counted, rows of a table without rowid can repeat the same key
        for (const key of yield* violations(
          tx,
          'Push would break a foreign key'
        )) {
          const index = before.indexOf(key)
          if (index < 0)
            throw new Error('Push would violate foreign key constraints')
          before.splice(index, 1)
        }
        return result
      },
      dry,
      {behavior: 'immediate'}
    )
  } finally {
    if (on) yield db.run(sql`pragma foreign_keys = on`)
  }
}

export const push: Push<'sqlite'> = createPush('sqlite', plan, runner)
