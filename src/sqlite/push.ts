import {compare, exists} from '../core/Compare.ts'
import type {Database} from '../core/Database.ts'
import {eq, inArray, or} from '../core/expr/Conditions.ts'
import {columns, foreignKeyChanges} from '../core/ForeignKey.ts'
import {type HasSql, getData} from '../core/Internal.ts'
import {
  type PlanOptions,
  type Push,
  type Runner,
  type Step,
  createPush,
  differ,
  renameColumn,
  renameSteps
} from '../core/Push.ts'
import type {Shape} from '../core/Shape.ts'
import {type Sql, sql} from '../core/Sql.ts'
import {type TableApi, table} from '../core/Table.ts'
import {type Gen, scratch, within} from '../core/Transaction.ts'
import {Master} from './catalog.ts'
import {integer, text} from './columns.ts'
import {prefix, shape} from './shape.ts'

export type {PushOptions, Schema} from '../core/Push.ts'

const Sequence = table('sqlite_sequence', {
  name: text().notNull(),
  seq: integer().notNull()
})

const Enforced = table('pragma_foreign_keys', {
  foreign_keys: integer().notNull()
})

const Violations = table('pragma_foreign_key_check', {
  table: text().notNull(),
  rowid: integer(),
  parent: text().notNull(),
  fkid: integer().notNull()
})

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
  options: PlanOptions
): Gen<Array<Step>> {
  // Unqualified names resolve to temp first, so a temporary object named
  // like the table, its indexes or a view would be changed instead
  const temp = Master('temp', 't')
  const main = Master('main', 'm')
  const nocase = (value: HasSql<string>) => sql<string>`${value} collate nocase`
  const related = tx
    .select(main.name)
    .from(main)
    .where(or(eq(nocase(main.tbl_name), api.name), eq(main.type, 'view')))
  const [shadowed] = yield* tx
    .select(temp.name)
    .from(temp)
    .where(
      or(eq(nocase(temp.name), api.name), inArray(nocase(temp.name), related))
    )
  if (shadowed)
    throw new Error(
      `Cannot push "${api.name}", a temporary "${shadowed}" shadows it`
    )
  const before = yield* shape(tx, api.name)
  if (!before) return api.create().map(sql => ({sql}))
  const renamed = renameSteps(api, before, options).map(pair =>
    renameColumn(api.identifier(), pair)
  )
  return yield* scratch(tx, function* (inner) {
    for (const step of renamed) yield inner.run(step.sql)
    const live = renamed.length > 0 ? (yield* shape(inner, api.name))! : before
    // Sqlite accepts foreign keys to missing tables, the copy keeps them
    const copy = prefix + api.name
    yield inner.run(api.createTable(copy))
    for (const [name, index] of Object.entries(api.indexes()))
      yield inner.run(getData(index).toSql(copy, prefix + name, false))
    const desired = (yield* shape(inner, copy, true))!
    const found = yield* changes(inner, api, live, desired, options.assume)
    return [...renamed, ...found]
  })
}

function* changes(
  tx: Database,
  api: TableApi,
  live: Shape,
  desired: Shape,
  assume?: boolean
): Gen<Array<Step>> {
  const target = api.identifier()
  const data = columns(api)
  const references = foreignKeyChanges(api, live)
  const {hasRows, dropped, added, changed, risks, nulls} = yield* compare({
    tx,
    target,
    table: api.name,
    live,
    desired,
    widens,
    assume
  })
  const sorted = (shape: Shape) =>
    Object.values(shape.constraints).toSorted().join()
  // Alter table can't add a not null column without a default, nor a
  // non-constant default to a table with rows
  const varying = added.some(name => {
    const value = desired.columns[name].default
    return value && !constant.test(value)
  })
  const addable =
    !added.some(name => {
      const column = desired.columns[name]
      return column.notNull && column.default === null
    }) && !(varying && (yield* hasRows()))
  if (
    live.rowid !== desired.rowid ||
    changed.length > 0 ||
    references.dropped.length > 0 ||
    sorted(live) !== sorted(desired) ||
    references.added.some(
      key => !key.inline || !added.includes(key.columns[0])
    ) ||
    !addable
  )
    return yield* recreate({
      tx,
      api,
      live,
      desired,
      hasRows,
      risk: Object.values({...risks, ...nulls})[0]
    })
  const indexes = api.indexes()
  const definition = (name: string) => api.columnDefinition(data[name].key)
  return [
    ...differ(live.indexes, desired.indexes).map(name => ({
      sql: sql`drop index ${sql.identifier(name)}`
    })),
    // Added first, a table can't lose its last column
    ...added.map(name => ({
      sql: sql`alter table ${target} add column ${definition(name)}`
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

interface Rebuild {
  tx: Database
  api: TableApi
  live: Shape
  desired: Shape
  hasRows: () => Gen<boolean>
  risk?: string
}

// https://www.sqlite.org/lang_altertable.html#otheralter
function* recreate({
  tx,
  api,
  live,
  desired,
  hasRows,
  risk
}: Rebuild): Gen<Array<Step>> {
  const target = api.identifier()
  const temp = sql.identifier(prefix + api.name)
  const data = columns(api)
  const rowid = live.rowid !== false
  // Views and triggers may use the table, sqlite reparses them between the
  // drop and the rename, so all of them are dropped and restored after
  const master = Master('main', 'm')
  const objects = (type: string) =>
    tx
      .select({name: master.name, sql: master.sql})
      .from(master)
      .where(eq(master.type, type))
      .orderBy(master.rowid)
  const triggers = yield* objects('trigger')
  const views = yield* objects('view')
  const increments = (shape: Shape) =>
    Object.values(shape.columns).some(column => column.extra)
  // Read as text, a counter can be larger than a JavaScript number holds
  const [sequence] =
    increments(live) && increments(desired)
      ? yield* tx
          .select(sql<string>`cast(${Sequence.seq} as text)`)
          .from(Sequence)
          .where(eq(Sequence.name, api.name))
      : []
  const copied = Object.keys(desired.columns).filter(name => live.columns[name])
  // Rowids are copied so they keep their values, through a name no column
  // shadows on either side, unless a copied column becomes the rowid
  const free = (shape: Shape) =>
    ['rowid', '_rowid_', 'oid'].find(
      alias =>
        !Object.keys(shape.columns).some(name => name.toLowerCase() === alias)
    )
  const from = free(live)
  const into = free(desired)
  const alias = desired.rowid as string
  const promoted = copied.includes(alias)
  if (rowid && !(from && (into || promoted)))
    throw new Error(`Cannot rebuild "${api.name}", its columns hide the rowid`)
  const moves =
    rowid &&
    promoted &&
    alias !== live.rowid &&
    (yield* exists(
      tx,
      target,
      sql`${sql.identifier(alias)} is not ${sql.identifier(from!)}`
    ))
  const ids = rowid && !promoted
  const names = [...(ids ? [into!] : []), ...copied]
  // Without a rowid or a column in common, there is nothing to copy rows by
  if (names.length === 0 && (yield* hasRows()))
    throw new Error(`Cannot rebuild "${api.name}", no column of its rows stays`)
  const selection = [
    ...(ids ? [sql.identifier(from!)] : []),
    ...copied.map(name => {
      const fallback = data[name].defaultValue
      const value = sql.identifier(name)
      const fills = desired.columns[name].notNull && !live.columns[name].notNull
      return fills && fallback
        ? sql`coalesce(${value}, ${fallback})`.inlineValues()
        : value
    })
  ]
  const list = sql.join(names.map(sql.identifier), sql`, `)
  const name = sql.inline(api.name)
  const seq = sql`cast(${sql.inline(sequence)} as integer)`
  const row = sql`values (${name}, ${seq})`
  return [
    // Triggers first, a trigger on a view goes before its view
    ...triggers.map(row => ({
      sql: sql`drop trigger ${sql.identifier(row.name)}`
    })),
    ...views.map(row => ({sql: sql`drop view ${sql.identifier(row.name)}`})),
    {sql: api.createTable(prefix + api.name)},
    ...(names.length > 0
      ? [
          {
            sql: sql`insert into ${temp} (${list}) select ${sql.join(
              selection,
              sql`, `
            )} from ${target}`
          }
        ]
      : []),
    // The old table goes with any data the copy leaves out
    {
      sql: sql`drop table ${target}`,
      risk:
        risk ??
        (moves
          ? `change the rowids of "${api.name}" to "${alias}"`
          : undefined),
      rebuild: true
    },
    {sql: sql`alter table ${temp} rename to ${sql.identifier(api.name)}`},
    ...(sequence
      ? [
          {sql: sql`delete from sqlite_sequence where name = ${name}`},
          {
            sql: sql`insert into sqlite_sequence (name, seq) ${row}`
          }
        ]
      : []),
    ...api.createIndexes().map(sql => ({sql})),
    ...[...views, ...triggers].map(row => ({sql: sql.unsafe(row.sql ?? '')}))
  ]
}

function* enforced(db: Database): Gen<boolean> {
  const [on] = yield* db.select(Enforced.foreign_keys).from(Enforced)
  return Boolean(on)
}

// The foreign_keys pragma is a no-op inside a transaction, so it is turned
// off around it and the keys are checked before commit. An immediate
// transaction keeps writers out between the data checks and the changes.
// A malformed foreign key, anywhere, makes the check itself fail
function* violations(tx: Database, failure: string): Gen<Array<string>> {
  try {
    const rows = yield* tx.select(Violations).from(Violations)
    return rows.map(row => Object.values(row).join())
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
