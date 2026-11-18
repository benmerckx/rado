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
  foreignKeyChanges,
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
  const renamed = renameSteps(api, before, options).map(([, , step]) => step)
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
  const sorted = (info: TableInfo) => values(info.constraints).toSorted().join()
  // What alter table add column accepts
  const addable = (name: string) => {
    const column = desired.columns[name]
    return (
      !(column.notNull && column.default === null) &&
      !(hasRows && column.default && !constant.test(column.default)) &&
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
  const [table]: Array<SchemaRow> = yield schema(
    tx,
    sql`type = 'table' and name = ${name}`
  )
  const rowid = !/without\s+rowid/i.test(table.sql!)
  // Dropping the table drops its triggers, views are dropped as well since
  // they may use it, and with them their instead of triggers
  const kept: Array<SchemaRow> = yield schema(
    tx,
    sql`type = 'view' or type = 'trigger' and (tbl_name = ${name} or tbl_name in (select name from sqlite_master where type = 'view'))`
  )
  const autoIncrement = (info: TableInfo) =>
    values(info.columns).some(column => column.extra)
  const sequence: {seq: number} | null =
    autoIncrement(live) && autoIncrement(desired)
      ? yield tx.get(sql`select seq from sqlite_sequence where name = ${name}`)
      : null
  const copied = keys(desired.columns).filter(name => live.columns[name])
  if (!rowid && copied.length === 0)
    throw new Error(`Cannot rebuild "${api.name}" without a column to copy`)
  // Rowids are copied so they keep their values, through a name no column
  // shadows on either side
  const free = (info: TableInfo) =>
    ['rowid', '_rowid_', 'oid'].find(
      alias => !keys(info.columns).some(name => name.toLowerCase() === alias)
    )
  const from = free(live)
  const into = free(desired)
  if (rowid && !(from && into))
    throw new Error(`Cannot rebuild "${api.name}", its columns hide the rowid`)
  const names = [...(rowid ? [into!] : []), ...copied]
  const selection = [...(rowid ? [from!] : []), ...copied].map(name => {
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
            sql: sql`insert into sqlite_sequence (name, seq) values (${name}, ${sql.inline(
              sequence.seq
            )})`
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
const runner: Runner = function* (db, apply, dry) {
  const on = yield* enforced(db)
  if (on) yield db.run(sql`pragma foreign_keys = off`)
  try {
    return yield* within(
      db,
      function* (tx) {
        const locked = on && (yield* enforced(tx))
        const tables: Array<string> = []
        const result = yield* apply(tx, true, (steps, api) => {
          if (locked && steps.some(step => step.rebuild))
            throw new Error('Cannot rebuild with foreign keys enforced')
          tables.push(api.name)
        })
        // Checked whether or not keys are enforced, a push must not add a
        // foreign key that its rows violate
        for (const name of tables) {
          const violations: Array<unknown> = yield tx.all(
            sql`select 1 from pragma_foreign_key_check(${sql.inline(name)})`
          )
          if (violations.length > 0)
            throw new Error('Push would violate foreign key constraints')
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
