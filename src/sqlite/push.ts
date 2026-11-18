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
  transaction
} from '../core/Push.ts'
import {type Sql, sql} from '../core/Sql.ts'
import type {TableApi} from '../core/Table.ts'
import {type SchemaRow, inspect, prefix, schema} from './inspect.ts'

export type {PushInput, PushOptions} from '../core/Push.ts'

const {entries, keys, values} = Object
const constant = /^(null|true|false|[-+\d.e]+|x?'([^']|'')*')$/i

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
    const desired = (yield* inspect(sp, copy))!
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
    desired
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
    ...dropped.map(name => ({
      sql: sql`alter table ${target} drop column ${sql.identifier(name)}`,
      risk: risks[name]
    })),
    ...added.map(name => ({
      sql: sql`alter table ${target} add column ${api.columnDefinition(
        data[name].key
      )}`
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
  const temp = sql.identifier(prefix + api.name)
  const data = columns(api)
  // Triggers go with the table, views are recreated since they may use it
  const kept: Array<SchemaRow> = yield schema(
    tx,
    sql`type = 'view' or type = 'trigger' and tbl_name = ${sql.inline(api.name)}`
  )
  const views = kept.filter(row => row.type === 'view')
  const copied = keys(desired.columns).filter(name => live.columns[name])
  const selection = copied.map(name => {
    const from = live.columns[name]
    const to = desired.columns[name]
    let value: Sql = sql.identifier(name)
    if (from.type !== to.type && to.type)
      value = sql`cast(${value} as ${sql.unsafe(to.type)})`
    const fallback = data[name].defaultValue
    if (to.notNull && !from.notNull && fallback)
      value = sql`coalesce(${value}, ${fallback})`.inlineValues()
    return value
  })
  const list = sql.join(copied.map(sql.identifier), sql`, `)
  return [
    ...views.map(view => ({sql: sql`drop view ${sql.identifier(view.name)}`})),
    {sql: api.createTable(prefix + api.name)},
    ...(copied.length > 0
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
    {sql: sql`drop table ${target}`, risk, rebuild: true},
    {sql: sql`alter table ${temp} rename to ${sql.identifier(api.name)}`},
    ...api.createIndexes().map(sql => ({sql})),
    ...kept.map(row => ({sql: sql.unsafe(row.sql!)}))
  ]
}

function* enforced(db: Database): Gen<boolean> {
  const row: {foreign_keys: number} = yield db.get(sql`pragma foreign_keys`)
  return Boolean(row?.foreign_keys)
}

// The foreign_keys pragma is a no-op inside a transaction, so it is turned
// off around it and the keys are checked before commit
const runner: Runner = function* (db, apply) {
  if (!(yield* enforced(db))) return yield transaction(db, apply)
  yield db.run(sql`pragma foreign_keys = off`)
  try {
    yield transaction(db, function* (tx) {
      const locked = yield* enforced(tx)
      yield* apply(tx, steps => {
        if (locked && steps.some(step => step.rebuild))
          throw new Error('Cannot rebuild with foreign keys enforced')
      })
      const violations: Array<unknown> = yield tx.all(
        sql`pragma foreign_key_check`
      )
      if (violations.length > 0)
        throw new Error('Push would violate foreign key constraints')
    })
  } finally {
    yield db.run(sql`pragma foreign_keys = on`)
  }
}

export const push: Push = createPush('sqlite', plan, runner)
