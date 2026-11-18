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
  foreignKey,
  foreignKeyChanges,
  grows,
  parseType,
  ranks,
  renameSteps,
  shadow,
  within
} from '../core/Push.ts'
import {type Sql, sql} from '../core/Sql.ts'
import type {TableApi} from '../core/Table.ts'
import {inspect} from './inspect.ts'

export type {PushInput, PushOptions} from '../core/Push.ts'

const {entries, fromEntries, values} = Object
const capacity: Record<string, number> = {
  tinytext: 255,
  text: 65535,
  mediumtext: 16777215,
  longtext: 4294967295
}

// Arguments a type has when they are left out
function fill(base: string): Array<number> {
  if (/^(datetime|timestamp|time)$/.test(base)) return [0]
  if (base === 'char' || base === 'binary') return [1]
  if (base === 'decimal') return [10, 0]
  return []
}

// Text capacity is in bytes, a character takes up to four
function widens(from: string, to: string): boolean {
  const a = parseType(from)
  const b = parseType(to)
  return (
    grows(a, b, fill) ||
    ranks('tinyint smallint mediumint int bigint', a.base, b.base) ||
    ranks('tinytext text mediumtext longtext', a.base, b.base) ||
    (/char/.test(a.base) && a.args[0] * 4 <= capacity[b.base])
  )
}

// One create table with its indexes, so a failing index leaves no table
function create(api: TableApi): Sql {
  const keys = entries(api.indexes()).map(([name, index]) => {
    const {unique, fields, order, using} = getData(index)
    return sql.join([
      unique && sql`unique`,
      sql`index ${sql.identifier(name)}`,
      using && sql`using ${using}`,
      sql`(${sql.join(
        fields.map(field => sql.join([field, order && sql.unsafe(order)])),
        sql`, `
      )})`
    ])
  })
  return sql`create table ${api.identifier()} (${sql.join(
    [api.createDefinition(), ...keys],
    sql`, `
  )})`.inlineFields(false)
}

function* plan(
  tx: Database,
  api: TableApi,
  options: PushOptions
): Gen<Array<Step>> {
  const {home}: {home: string} = yield tx.get(sql`select database() as home`)
  const schema = api.schemaName ?? home
  const before = yield* inspect(tx, api.name, schema)
  if (!before) return [{sql: create(api)}]
  // The catalog shows the permanent table, statements reach a temporary one
  // of the same name on this connection
  const [shown]: Array<Record<string, string>> = yield tx.all(
    sql`show create table ${api.identifier()}`
  )
  if (/^create temporary/i.test(values(shown)[1]))
    throw new Error(`Cannot push "${api.name}", a temporary table shadows it`)
  const renamed = fromEntries(renameSteps(api, before, options))
  const live = Object.keys(renamed).length
    ? (yield* inspect(tx, api.name, schema, renamed))!
    : before
  // DDL is not transactional: the desired table is created under a fresh
  // name next to the real one and only what was created is dropped
  const copy = shadow(
    api,
    `__rado_${Math.random().toString(36).slice(2, 12)}`,
    api.schemaName
  )
  let created = false
  let desired: TableInfo
  try {
    yield tx.run(create(copy))
    created = true
    desired = (yield* inspect(tx, copy.name, schema))!
  } finally {
    if (created) yield tx.run(sql`drop table ${copy.identifier()}`)
  }
  return yield* changes(tx, api, live, desired, renamed, home)
}

// All changes go into one alter table, which MySQL applies atomically
function* changes(
  tx: Database,
  api: TableApi,
  live: TableInfo,
  desired: TableInfo,
  renamed: Record<string, string>,
  home: string
): Gen<Array<Step>> {
  const target = api.identifier()
  const data = columns(api)
  const bare = shadow(api, api.name, undefined, true)
  const original = fromEntries(
    Object.entries(renamed).map(([from, to]) => [to, from])
  )
  const source = (name: string) => original[name] ?? name
  const fks = foreignKeyChanges(api, live, home)
  const kept = live.foreignKeys.filter(fk => !fks.dropped.includes(fk))
  // MySQL adds an index for each foreign key that lacks one
  const implicit = new Set(
    kept
      .flatMap(fk => [fk.name!, fk.columns[0]])
      .filter(name => !desired.indexes[name])
  )
  const {dropped, added, changed, risks, nulls} = yield* compare(
    tx,
    target,
    api.name,
    live,
    desired,
    widens,
    source,
    // A column seen empty can fill up before the alter table runs
    "MySQL can't keep writers out while it checks the data, pass force"
  )
  const primary = desired.constraints.primary
  const pkChanged = live.constraints.primary !== primary
  const definition = (name: string) => bare.columnDefinition(data[name].key)
  const fills: Array<Step> = []
  let risk: string | undefined
  const clauses: Array<Sql> = [
    ...fks.dropped.map(fk => sql`drop foreign key ${sql.identifier(fk.name!)}`),
    ...differ(live.indexes, desired.indexes)
      .filter(name => !implicit.has(name))
      .map(name => sql`drop index ${sql.identifier(name)}`),
    ...(pkChanged && live.constraints.primary ? [sql`drop primary key`] : []),
    ...dropped.map(name => {
      risk ??= risks[name]
      return sql`drop column ${sql.identifier(name)}`
    }),
    ...added.map(name => sql`add column ${definition(name)}`)
  ]
  for (const name of Object.keys(desired.columns)) {
    const from = source(name)
    const change = changed.includes(name)
    if (!change && from === name) continue
    if (!change) {
      clauses.push(
        sql`rename column ${sql.identifier(from)} to ${sql.identifier(name)}`
      )
      continue
    }
    const fallback = data[name].defaultValue
    if (nulls[name] && fallback)
      fills.push({
        sql: sql`update ${target} set ${sql.identifier(from)} = (${fallback}) where ${sql.identifier(from)} is null`.inlineValues(),
        risk: nulls[name]
      })
    risk ??= risks[name] ?? (fallback ? undefined : nulls[name])
    // The whole definition is given, change resets what it leaves out
    clauses.push(sql`change column ${sql.identifier(from)} ${definition(name)}`)
  }
  clauses.push(
    ...(pkChanged && primary ? [sql.unsafe(`add ${primary}`)] : []),
    ...differ(desired.indexes, live.indexes).map(name => {
      const def = desired.indexes[name]
      const unique = def.startsWith('unique ')
      return sql`add ${sql.unsafe(unique ? 'unique ' : '')}index ${sql.identifier(
        name
      )} ${sql.unsafe(unique ? def.slice(7) : def)}`
    }),
    ...fks.added.map(fk => sql`add ${foreignKey(fk)}`)
  )
  if (clauses.length === 0) return fills
  return [
    ...fills,
    {sql: sql`alter table ${target} ${sql.join(clauses, sql`, `)}`, risk}
  ]
}

// DDL commits implicitly, which would commit a caller's transaction and a
// dry run can't be rolled back, so it plans each table against the database
// as it is
const runner: Runner = function* (db, apply, dry) {
  try {
    // Fails while a transaction is open, else it only sets the default
    yield db.run(sql`set transaction read write`)
  } catch {
    throw new Error('Cannot push inside a MySQL transaction')
  }
  // A transaction holds one connection for every statement, DDL still
  // commits as it goes
  return yield* within(db, tx => apply(tx, !dry), false)
}

// Refused before anything is created, MySQL would silently build a different
// index
function validate(api: TableApi): void {
  for (const [name, index] of entries(api.indexes())) {
    const data = getData(index) as unknown as Record<string, unknown>
    const option = ['where', 'nulls', 'concurrently', 'only'].find(
      key => data[key]
    )
    if (option)
      throw new Error(`MySQL indexes don't support ${option}, see "${name}"`)
  }
}

export const push: Push<'mysql'> = createPush('mysql', plan, runner, validate)
