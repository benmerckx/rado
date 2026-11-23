import {compare} from '../core/Compare.ts'
import type {Database} from '../core/Database.ts'
import {and, eq, isNull, not} from '../core/expr/Conditions.ts'
import {columns, foreignKey, foreignKeyChanges} from '../core/ForeignKey.ts'
import {getData} from '../core/Internal.ts'
import {
  type Push,
  type PlanOptions,
  type Runner,
  type Step,
  createPush,
  differ,
  renameSteps,
  shadow
} from '../core/Push.ts'
import type {Shape} from '../core/Shape.ts'
import {type Sql, sql} from '../core/Sql.ts'
import type {TableApi} from '../core/Table.ts'
import {type Gen, result, within} from '../core/Transaction.ts'
import {grows, parseType, ranks} from '../core/Widening.ts'
import {Usage, home} from './catalog.ts'
import {shape} from './shape.ts'

export type {PushOptions, Schema} from '../core/Push.ts'

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
  const keys = Object.entries(api.indexes()).map(([name, index]) => {
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

// Foreign keys of other tables that reference this one, with the referenced
// columns as a list
function* dependents(tx: Database, schema: string, name: string) {
  return yield* tx
    .select({
      name: Usage.constraint_name,
      schema: Usage.table_schema,
      table: Usage.table_name,
      columns: sql<string>`group_concat(
        ${Usage.referenced_column_name} order by ${Usage.ordinal_position}
      )`
    })
    .from(Usage)
    .where(
      eq(Usage.referenced_table_schema, schema),
      eq(Usage.referenced_table_name, name),
      not(and(eq(Usage.table_schema, schema), eq(Usage.table_name, name)))
    )
    .groupBy(Usage.constraint_name, Usage.table_schema, Usage.table_name)
}

function* plan(
  tx: Database,
  api: TableApi,
  options: PlanOptions,
  tables: Array<TableApi>
): Gen<Array<Step>> {
  const base = yield* home(tx)
  const schema = api.schemaName ?? base
  const before = yield* shape(tx, api.name, schema)
  if (!before) return [{sql: create(api)}]
  // The catalog shows the permanent table, statements reach a temporary one
  // of the same name on this connection
  const [shown] = yield* result(
    tx.all(sql<Record<string, string>>`show create table ${api.identifier()}`)
  )
  if (/^create temporary/i.test(Object.values(shown)[1]))
    throw new Error(`Cannot push "${api.name}", a temporary table shadows it`)
  const renamed = Object.fromEntries(renameSteps(api, before, options))
  const live = Object.keys(renamed).length
    ? (yield* shape(tx, api.name, schema, renamed))!
    : before
  const desired = yield* copy(tx, api, schema)
  return yield* changes({
    tx,
    api,
    live,
    desired,
    renamed,
    home: base,
    schema,
    tables,
    capture: options.capture
  })
}

// DDL is not transactional: the desired table is created under a fresh
// name next to the real one and dropped again
function* copy(tx: Database, api: TableApi, schema: string): Gen<Shape> {
  const name = `__rado_${Math.random().toString(36).slice(2, 12)}`
  const table = shadow(api, name, api.schemaName)
  yield tx.run(create(table))
  try {
    return (yield* shape(tx, name, schema))!
  } finally {
    yield tx.run(sql`drop table ${table.identifier()}`)
  }
}

interface Plan {
  tx: Database
  api: TableApi
  live: Shape
  desired: Shape
  renamed: Record<string, string>
  home: string
  schema: string
  tables: Array<TableApi>
  capture?: boolean
}

// All changes go into one alter table, which MySQL applies atomically
function* changes({
  tx,
  api,
  live,
  desired,
  renamed,
  home,
  schema,
  tables,
  capture
}: Plan): Gen<Array<Step>> {
  const target = api.identifier()
  const data = columns(api)
  const bare = shadow(api, api.name, undefined, true)
  const original = Object.fromEntries(
    Object.entries(renamed).map(([from, to]) => [to, from])
  )
  const source = (name: string) => original[name] ?? name
  const references = foreignKeyChanges(api, live, home)
  const kept = live.foreignKeys.filter(key => !references.dropped.includes(key))
  // MySQL adds an index for each foreign key that lacks one
  const implicit = new Set(
    kept
      .flatMap(key => [key.name!, key.columns[0]])
      .filter(name => !desired.indexes[name])
  )
  const {dropped, added, changed, risks, nulls} = yield* compare({
    tx,
    target,
    table: api.name,
    live,
    desired,
    widens,
    source,
    // A column seen empty can fill up before the alter table runs
    unchecked: capture
      ? undefined
      : "MySQL can't keep writers out while it checks the data, pass force",
    capture
  })
  const primary = desired.constraints.primary
  const primaryChanged = live.constraints.primary !== primary
  const definition = (name: string) => bare.columnDefinition(data[name].key)
  const fallback = (name: string) => data[name].defaultValue
  const fills = changed
    .filter(name => nulls[name] && fallback(name))
    .map((name): Step => {
      const column = sql.identifier(source(name))
      const value = fallback(name)
      return {
        sql: sql`update ${target} set ${column} = (${value}) where ${isNull(
          column
        )}`.inlineValues(),
        risk: nulls[name]
      }
    })
  const risk = [
    ...dropped.map(name => risks[name]),
    ...added.map(name => risks[name]),
    ...changed.map(
      name => risks[name] ?? (fallback(name) ? undefined : nulls[name])
    )
  ].find(Boolean)
  // The whole definition is given, change resets what it leaves out
  const alter = (name: string) => {
    const from = sql.identifier(source(name))
    if (changed.includes(name))
      return [sql`change column ${from} ${definition(name)}`]
    if (source(name) === name) return []
    return [sql`rename column ${from} to ${sql.identifier(name)}`]
  }
  const index = (name: string) => {
    const columns = desired.indexes[name]
    const unique = columns.startsWith('unique ')
    return sql.join([
      sql`add`,
      unique && sql`unique`,
      sql`index ${sql.identifier(name)}`,
      sql.unsafe(columns.replace(/^unique /, ''))
    ])
  }
  const clauses: Array<Sql> = [
    ...references.dropped.map(
      key => sql`drop foreign key ${sql.identifier(key.name!)}`
    ),
    ...differ(live.indexes, desired.indexes)
      .filter(name => !implicit.has(name))
      .map(name => sql`drop index ${sql.identifier(name)}`),
    ...(primaryChanged && live.constraints.primary
      ? [sql`drop primary key`]
      : []),
    ...dropped.map(name => sql`drop column ${sql.identifier(name)}`),
    ...added.map(name => sql`add column ${definition(name)}`),
    ...Object.keys(desired.columns).flatMap(alter),
    ...(primaryChanged && primary ? [sql`add ${sql.unsafe(primary)}`] : []),
    ...differ(desired.indexes, live.indexes).map(index),
    ...references.added.map(key => sql`add ${foreignKey(key)}`)
  ]
  // Foreign keys of other pushed tables on a key that goes are dropped
  // first, the other table's own plan adds what it wants
  const gone = [
    ...(primaryChanged ? [live.constraints.primary] : []),
    ...differ(live.indexes, desired.indexes).map(name => live.indexes[name])
  ].map(definition => definition?.replace(/^[^(]*\(|\)$|`/g, ''))
  const others =
    gone.length || changed.length ? yield* dependents(tx, schema, api.name) : []
  const drops = others
    .filter(
      key =>
        (gone.includes(key.columns) ||
          changed.some(name =>
            key.columns.split(',').includes(source(name))
          )) &&
        tables.some(
          other =>
            other.name === key.table &&
            (other.schemaName ?? home) === key.schema
        )
    )
    .map(key => ({
      sql: sql`alter table ${sql.identifier(key.schema)}.${sql.identifier(
        key.table
      )} drop foreign key ${sql.identifier(key.name)}`
    }))
  if (clauses.length === 0) return [...drops, ...fills]
  return [
    ...drops,
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
  for (const [name, index] of Object.entries(api.indexes())) {
    const data = getData(index)
    const option = (['where', 'nulls', 'concurrently', 'only'] as const).find(
      key => data[key]
    )
    if (option)
      throw new Error(`MySQL indexes don't support ${option}, see "${name}"`)
  }
}

export const push: Push<'mysql'> = createPush('mysql', plan, runner, validate)
