import {compare, exists, keyRisk, referenceRisk} from '../core/Compare.ts'
import type {Database} from '../core/Database.ts'
import {eq, inArray, or} from '../core/expr/Conditions.ts'
import {columns, foreignKeyChanges} from '../core/ForeignKey.ts'
import {type HasSql, getData} from '../core/Internal.ts'
import {type Define, define} from '../core/Order.ts'
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
import {Master, cascading} from './catalog.ts'
import {integer, text} from './columns.ts'
import {unenforced} from './keys.ts'
import {prefix, shape} from './shape.ts'

export type {Define} from '../core/Order.ts'
export type {PushOptions, Schema} from '../core/Push.ts'

const Sequence = table('sqlite_sequence', {
  name: text().notNull(),
  seq: integer().notNull()
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
    const found = yield* changes(inner, api, live, desired, options.capture)
    return [...renamed, ...found]
  })
}

function* changes(
  tx: Database,
  api: TableApi,
  live: Shape,
  desired: Shape,
  capture?: boolean
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
    capture
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
      risks: [
        ...Object.values(risks),
        ...Object.values(nulls),
        // Keys are compared by definition, sqlite names unique keys by their
        // place in the table
        ...(capture
          ? [
              ...Object.entries(desired.constraints)
                .filter(
                  ([, value]) =>
                    !Object.values(live.constraints).includes(value)
                )
                .map(([name, value]) => keyRisk(name, value)),
              ...references.added.map(key => referenceRisk(key.name))
            ]
          : [])
      ].filter(risk => risk !== undefined),
      capture
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
      sql: getData(indexes[name]).toSql(api.name, name, false),
      risk: capture ? keyRisk(name, desired.indexes[name]) : undefined
    }))
  ]
}

interface Rebuild {
  tx: Database
  api: TableApi
  live: Shape
  desired: Shape
  hasRows: () => Gen<boolean>
  risks: Array<string>
  capture?: boolean
}

// https://www.sqlite.org/lang_altertable.html#otheralter
function* recreate({
  tx,
  api,
  live,
  desired,
  hasRows,
  risks,
  capture
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
    // The shadow has no rows to tell
    (capture ||
      (yield* exists(
        tx,
        target,
        sql`${sql.identifier(alias)} is not ${sql.identifier(from!)}`
      )))
  const ids = rowid && !promoted
  const names = [...(ids ? [into!] : []), ...copied]
  // Without a rowid or a column in common, there is nothing to copy rows by
  const lost = `drop the rows of "${api.name}", no column of them stays`
  if (names.length === 0 && !capture && (yield* hasRows()))
    throw new Error(`Cannot rebuild "${api.name}", no column of its rows stays`)
  const loses = [
    ...risks,
    ...(moves ? [`change the rowids of "${api.name}" to "${alias}"`] : []),
    ...(names.length === 0 && capture ? [lost] : [])
  ]
  const copy = names.length > 0
  // Where keys can't be turned off, dropping the old table deletes the rows
  // that reference it
  const cascades = capture
    ? (yield* cascading(tx, api.name)).map(
        child =>
          `rebuild "${api.name}", deletes rows of "${child}" where foreign ` +
          'keys stay enforced (D1, Durable Objects)'
      )
    : []
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
    // Keys can't be turned off inside a migration's transaction, deferred
    // they are checked at commit, after the table is back
    ...(capture ? [{sql: sql`pragma defer_foreign_keys = on`}] : []),
    // Triggers first, a trigger on a view goes before its view
    ...triggers.map(row => ({
      sql: sql`drop trigger ${sql.identifier(row.name)}`
    })),
    ...views.map(row => ({sql: sql`drop view ${sql.identifier(row.name)}`})),
    {sql: api.createTable(prefix + api.name)},
    ...(copy
      ? [
          {
            sql: sql`insert into ${temp} (${list}) select ${sql.join(
              selection,
              sql`, `
            )} from ${target}`,
            risk: loses[0],
            risks: loses
          }
        ]
      : []),
    // The old table goes with any data the copy leaves out
    {
      sql: sql`drop table ${target}`,
      ...(copy ? {} : {risk: loses[0]}),
      risks: [...(copy ? [] : loses), ...cascades],
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
    ...Object.entries(api.indexes()).map(([name, index]) => ({
      sql: getData(index).toSql(api.name, name, false),
      risk:
        capture && live.indexes[name] !== desired.indexes[name]
          ? keyRisk(name, desired.indexes[name])
          : undefined
    })),
    ...[...views, ...triggers].map(row => ({sql: sql.unsafe(row.sql ?? '')}))
  ]
}

const runner: Runner = (db, apply, dry) =>
  unenforced(db, {name: 'Push', dry}, (tx, locked) =>
    apply(tx, true, steps => {
      if (locked && steps.some(step => step.rebuild))
        throw new Error('Cannot rebuild with foreign keys enforced')
    })
  )

export const push: Push<'sqlite'> = createPush('sqlite', plan, runner)

export const create: Define<'sqlite'> = define('sqlite', false)
export const drop: Define<'sqlite'> = define('sqlite', true)
