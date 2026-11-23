import {
  type Changes,
  type Comparison,
  compare,
  keyRisk,
  referenceRisk
} from '../core/Compare.ts'
import type {Database} from '../core/Database.ts'
import {eq, inArray, isNull, ne} from '../core/expr/Conditions.ts'
import {
  columns,
  foreignKey,
  foreignKeyChanges,
  foreignKeys
} from '../core/ForeignKey.ts'
import {getData} from '../core/Internal.ts'
import {
  type Push,
  type PlanOptions,
  type Step,
  createPush,
  differ,
  renameColumn,
  renameSteps,
  shadow
} from '../core/Push.ts'
import type {Shape} from '../core/Shape.ts'
import {type Sql, sql} from '../core/Sql.ts'
import {alias, type TableApi} from '../core/Table.ts'
import {type Gen, result, scratch} from '../core/Transaction.ts'
import {grows, parseType, ranks} from '../core/Widening.ts'
import {Class, Constraint, Namespace, home, prepend} from './catalog.ts'
import {enumSchemas} from './enum.ts'
import {shape} from './shape.ts'

export type {PushOptions, Schema} from '../core/Push.ts'

// Arguments a type has when they are left out, unlimited where unbounded
function fill(base: string): Array<number> {
  if (/^(character varying|bit varying)$/.test(base)) return [Infinity]
  if (base === 'numeric') return [Infinity, Infinity]
  if (/^(time|timestamp|interval)\b/.test(base)) return [6]
  if (base === 'character' || base === 'bit') return [1]
  return []
}

function widens(from: string, to: string): boolean {
  const a = parseType(from)
  const b = parseType(to)
  return (
    grows(a, b, fill) ||
    ranks('smallint integer bigint', a.base, b.base) ||
    (/^(character|text)/.test(a.base) &&
      (to === 'text' || to === 'character varying'))
  )
}

// The oid of a relation, which stands in for its name in queries
function* relation(
  tx: Database,
  schema: string,
  name: string
): Gen<number | undefined> {
  const [oid] = yield* tx
    .select(Class.oid)
    .from(Class)
    .innerJoin(Namespace, eq(Namespace.oid, Class.relnamespace))
    .where(eq(Namespace.nspname, schema), eq(Class.relname, name))
  return oid
}

// Foreign keys of other tables on a key of this one
function* dependents(tx: Database, oid: number) {
  const Owner = alias(Class, 'r')
  const Space = alias(Namespace, 'n')
  const Key = alias(Class, 'i')
  return yield* tx
    .select({
      schema: Space.nspname,
      table: Owner.relname,
      key: Key.relname,
      name: Constraint.conname
    })
    .from(Constraint)
    .innerJoin(Owner, eq(Owner.oid, Constraint.conrelid))
    .innerJoin(Space, eq(Space.oid, Owner.relnamespace))
    .innerJoin(Key, eq(Key.oid, Constraint.conindid))
    .where(
      eq(Constraint.contype, 'f'),
      ne(Constraint.conrelid, Constraint.confrelid),
      eq(Constraint.confrelid, oid)
    )
}

// Push names every schema, so a temporary table can't shadow a name. The
// shadow generate runs on has none, and a migration file that leaves out the
// home schema runs under any search_path
function scope(options: PlanOptions, home: string) {
  return (schema: string): string | undefined =>
    options.capture && schema === home ? undefined : schema
}

const at = (schema: string | undefined, name: Sql): Sql =>
  schema ? sql`${sql.identifier(schema)}.${name}` : name

// Schemas that don't exist yet, for the table and its enums. If not exists,
// a file generated against a shadow may run where they do.
function* schemas(tx: Database, names: Array<string>): Gen<Array<Step>> {
  const found = yield* tx
    .select(Namespace.nspname)
    .from(Namespace)
    .where(inArray(Namespace.nspname, names))
  return names
    .filter((name, i) => names.indexOf(name) === i && !found.includes(name))
    .map(name => ({
      sql: sql`create schema if not exists ${sql.identifier(name)}`
    }))
}

function* plan(
  tx: Database,
  api: TableApi,
  options: PlanOptions,
  tables: Array<TableApi>
): Gen<Array<Step>> {
  const base = yield* home(tx)
  const schema = api.schemaName ?? base
  const own = scope(options, base)
  const target = at(own(schema), sql.identifier(api.name))
  const oid = yield* relation(tx, schema, api.name)
  // A new table gets its foreign keys afterwards, with qualified references
  // a temporary table can't shadow
  if (oid === undefined) {
    return [
      // A dry run applies them, the tables after see them
      ...(yield* schemas(tx, [schema, ...enumSchemas(api)])),
      ...shadow(api, api.name, own(schema))
        .create()
        .map(sql => ({sql})),
      ...foreignKeys(api).map(key => ({
        sql: sql`alter table ${target} add ${foreignKey({
          ...key,
          schema: own(key.schema ?? base)
        })}`
      }))
    ]
  }
  // Keeps writers out until the transaction ends, so the data checks hold,
  // and the table is read under the lock
  yield tx.run(sql`lock table ${target} in share row exclusive mode`)
  const before = (yield* shape(tx, api.name, schema))!
  const renamed = renameSteps(api, before, options).map(pair =>
    renameColumn(target, pair)
  )
  return yield* scratch(tx, function* (inner) {
    for (const step of renamed) yield inner.run(step.sql)
    const live =
      renamed.length > 0 ? (yield* shape(inner, api.name, schema))! : before
    // The copy needs them, so they're created in the scratch transaction
    const spaces = yield* schemas(inner, enumSchemas(api))
    for (const step of spaces) yield inner.run(step.sql)
    const enums: Array<Step> = []
    for (const query of api.createEnums()) {
      const name = inner.dialect.inline(query).match(/type (.+?) as/)![1]
      const [found] = yield* inner.select(sql<unknown>`to_regtype(${name})`)
      if (!found) enums.push({sql: query})
    }
    const desired = yield* scratch(inner, tx => copy(tx, api))
    return [
      ...spaces,
      ...enums,
      ...renamed,
      ...(yield* changes({
        tx: inner,
        api,
        oid,
        schema,
        target,
        live,
        desired,
        home: base,
        options,
        tables
      }))
    ]
  })
}

// The desired table, created in a fresh schema so an existing one is never
// touched
function* copy(tx: Database, api: TableApi): Gen<Shape> {
  const schema = `rado_push_${Math.random().toString(36).slice(2)}`
  yield tx.run(sql`create schema ${sql.identifier(schema)}`)
  yield* prepend(tx, schema)
  for (const query of shadow(api, api.name, schema).create())
    yield tx.run(query)
  return (yield* shape(tx, api.name, schema))!
}

// Rows a policy hides would pass the data checks, so the checks run with
// row security off, which fails instead of hiding them
function* checked(comparison: Comparison): Gen<Changes> {
  try {
    return yield* compare(comparison)
  } catch (error) {
    if (!/row-level security/.test(String(error))) throw error
    const table = `"${comparison.table}"`
    const behind = 'behind row level security'
    throw new Error(
      `Push can't check the rows of ${table} ${behind}, pass force`,
      {cause: error}
    )
  }
}

interface Plan {
  tx: Database
  api: TableApi
  oid: number
  schema: string
  // The resolved table, a temporary table of the same name can't shadow it
  target: Sql
  live: Shape
  desired: Shape
  home: string
  options: PlanOptions
  tables: Array<TableApi>
}

function* changes({
  tx,
  api,
  oid,
  schema,
  target,
  live,
  desired,
  home,
  options,
  tables
}: Plan): Gen<Array<Step>> {
  const data = columns(api)
  const own = scope(options, home)
  const bare = shadow(api, api.name, api.schemaName, true)
  const alter = (change: Sql, risk?: string): Step => ({
    sql: sql`alter table ${target} ${change}`,
    risk
  })
  // Evaluating an expression can do what a rollback doesn't undo, such as
  // drawing from a sequence, so a dry run only applies constant defaults
  const draws = (name: string) => {
    const value = data[name].defaultValue
    return Boolean(
      value &&
      !/^('([^']|'')*'|-?[\d.]+|true|false|null)$/i.test(
        tx.dialect.inline(value)
      )
    )
  }
  const references = foreignKeyChanges(api, live, home)
  if (!options.force) yield tx.run(sql`set local row_security = off`)
  const {dropped, added, changed, risks, nulls} = yield* checked({
    tx,
    target,
    table: api.name,
    live,
    desired,
    widens,
    capture: options.capture
  })
  const wanted = new Set(Object.values(desired.constraints))
  const present = new Set(Object.values(live.constraints))
  const indexes = api.indexes()
  const gone = [
    ...differ(live.indexes, desired.indexes),
    ...Object.entries(live.constraints)
      .filter(([, definition]) => !wanted.has(definition))
      .map(([name]) => name)
  ]
  // Foreign keys of other pushed tables on a key that goes are dropped
  // first, the other table's own plan adds them back
  const others = gone.length ? yield* dependents(tx, oid) : []
  const pushed = (key: {schema: string; table: string}) =>
    tables.some(
      other =>
        other.name === key.table && (other.schemaName ?? home) === key.schema
    )
  const steps: Array<Step> = [
    ...others
      .filter(key => gone.includes(key.key) && pushed(key))
      .map(key => ({
        sql: sql`alter table ${at(
          own(key.schema),
          sql.identifier(key.table)
        )} drop constraint ${sql.identifier(key.name)}`
      })),
    ...references.dropped.map(key =>
      alter(sql`drop constraint ${sql.identifier(key.name!)}`)
    ),
    ...gone.map(name =>
      live.indexes[name]
        ? {
            sql: sql`drop index ${at(own(schema), sql.identifier(name))}`
          }
        : alter(sql`drop constraint ${sql.identifier(name)}`)
    ),
    ...dropped.map(name =>
      alter(sql`drop column ${sql.identifier(name)}`, risks[name])
    ),
    ...added.map(name => ({
      ...alter(
        sql`add column ${bare.columnDefinition(data[name].key)}`,
        risks[name]
      ),
      effect: draws(name)
    }))
  ]
  // Steps are inlined, so the table's name is quoted by postgres
  const relname = sql`${sql.inline(api.name)}::text`
  const quoted = own(schema)
    ? sql`format('%I.%I', ${sql.inline(schema)}::text, ${relname})`
    : sql`format('%I', ${relname})`
  const serial = (name: string) =>
    sql<string | null>`pg_get_serial_sequence(${quoted}, ${sql.inline(name)})`
  for (const name of changed) {
    const from = live.columns[name]
    const to = desired.columns[name]
    const id = sql.identifier(name)
    const column = sql`alter column ${id}`
    // The value a sequence continues from, above the rows
    const next = sql`greatest(coalesce(max(${id}), 0) + 1, 1)`
    const restart = (sequence: Sql) =>
      sql`select setval(${sequence}, ${next}, false) from ${target}`
    const kind = to.extra === 'a' ? sql`always` : sql`by default`
    // An identity goes first, it holds the column not null
    if (from.extra && !to.extra) steps.push(alter(sql`${column} drop identity`))
    const retype = from.type !== to.type
    // Postgres casts the old default along with the column, so it goes first
    const cleared = retype && from.default !== null
    if (cleared) steps.push(alter(sql`${column} drop default`))
    if (retype) {
      const type = sql.unsafe(to.type)
      steps.push(
        alter(sql`${column} type ${type} using ${id}::${type}`, risks[name])
      )
    }
    // A sequence the copy's default draws from is created for the column
    const sequence = to.default?.match(/^nextval\('(.+)'::regclass\)$/)?.[1]
    if (sequence && to.default !== from.default) {
      const created = at(own(schema), sql.unsafe(sequence))
      // A default takes no parameters, the name goes in as a literal
      const literal = sql.inline(tx.dialect.inline(created))
      steps.push(
        {sql: sql`create sequence ${created} owned by ${target}.${id}`},
        {sql: restart(literal)},
        alter(sql`${column} set default nextval(${literal})`)
      )
    } else if (to.default !== (cleared ? null : from.default))
      steps.push(
        alter(
          to.default === null
            ? sql`${column} drop default`
            : sql`${column} set default ${sql.unsafe(to.default)}`
        )
      )
    // Not null comes before an identity, which requires it
    if (from.notNull !== to.notNull) {
      const fallback = data[name].defaultValue
      const risk = nulls[name]
      if (risk && fallback)
        steps.push({
          sql: sql`update ${target} set ${id} = (${fallback}) where ${isNull(
            id
          )}`.inlineValues(),
          risk,
          // An update can fire triggers
          effect: true
        })
      const change = to.notNull ? sql`set not null` : sql`drop not null`
      steps.push(alter(sql`${column} ${change}`, fallback ? undefined : risk))
    }
    if (to.extra && from.extra !== to.extra) {
      // A serial's sequence goes with its default, so the identity's own
      // sequence is the one that continues above the rows
      // As regclass text it names the schema only when it isn't the home
      const [owned] = yield* tx.select(
        options.capture
          ? sql<string | null>`${serial(name)}::regclass::text`
          : serial(name)
      )
      if (!from.extra && owned)
        steps.push({sql: sql`drop sequence ${sql.unsafe(owned)}`})
      steps.push(
        alter(
          from.extra
            ? sql`${column} set generated ${kind}`
            : sql`${column} add generated ${kind} as identity`
        )
      )
      // A new identity starts at 1, it continues above the rows it has
      if (!from.extra)
        steps.push({
          sql: restart(serial(name))
        })
    }
  }
  return [
    ...steps,
    ...Object.entries(desired.constraints)
      .filter(([, definition]) => !present.has(definition))
      .map(([name, definition]) =>
        alter(
          sql`add constraint ${sql.identifier(name)} ${sql.unsafe(definition)}`,
          options.capture ? keyRisk(name, definition) : undefined
        )
      ),
    ...references.added.map(key =>
      alter(
        sql`add ${foreignKey({...key, schema: own(key.schema ?? home)})}`,
        options.capture ? referenceRisk(key.name) : undefined
      )
    ),
    ...differ(desired.indexes, live.indexes).map(name => ({
      sql: getData(indexes[name]).toSql(api.name, name, false, own(schema)),
      risk: options.capture ? keyRisk(name, desired.indexes[name]) : undefined
    }))
  ]
}

export const push: Push<'postgres'> = createPush('postgres', plan)
