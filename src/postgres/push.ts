import type {Database} from '../core/Database.ts'
import {getData} from '../core/Internal.ts'
import {
  type Changes,
  type Gen,
  type Push,
  type PushOptions,
  type Step,
  type TableInfo,
  columns,
  compare,
  createPush,
  differ,
  foreignKey,
  foreignKeyChanges,
  foreignKeys,
  grows,
  parseType,
  ranks,
  renameColumn,
  renameSteps,
  scratch,
  shadow
} from '../core/Push.ts'
import {type Sql, sql} from '../core/Sql.ts'
import type {TableApi} from '../core/Table.ts'
import {inspect, prepend} from './inspect.ts'

export type {PushInput, PushOptions} from '../core/Push.ts'

const {entries, values} = Object

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

function* plan(
  tx: Database,
  api: TableApi,
  options: PushOptions,
  tables: Array<TableApi>
): Gen<Array<Step>> {
  const {home}: {home: string} = yield tx.get(
    sql`select current_schema() as home`
  )
  const schema = api.schemaName ?? home
  const target = sql`${sql.identifier(schema)}.${sql.identifier(api.name)}`
  const {found}: {found: unknown} = yield tx.get(
    sql`select to_regclass(format('%I.%I', ${schema}::text, ${api.name}::text)) as found`
  )
  // A new table gets its foreign keys afterwards, with qualified references
  // a temporary table can't shadow
  if (!found)
    return [
      ...shadow(api, api.name, schema)
        .create()
        .map(sql => ({sql})),
      ...foreignKeys(api).map(fk => ({
        sql: sql`alter table ${target} add ${foreignKey({
          ...fk,
          schema: fk.schema ?? home
        })}`
      }))
    ]
  // Keeps writers out until the transaction ends, so the data checks hold,
  // and the table is read under the lock
  yield tx.run(sql`lock table ${target} in share row exclusive mode`)
  const before = (yield* inspect(tx, api.name, schema))!
  const renamed = renameSteps(api, before, options).map(pair =>
    renameColumn(target, pair)
  )
  return yield* scratch(tx, function* (sp) {
    for (const step of renamed) yield sp.run(step.sql)
    const live =
      renamed.length > 0 ? (yield* inspect(sp, api.name, schema))! : before
    const enums: Array<Step> = []
    for (const query of api.createEnums()) {
      const name = sp.dialect.inline(query).match(/type (.+?) as/)![1]
      const row: {found: unknown} = yield sp.get(
        sql`select to_regtype(${name}) as found`
      )
      if (!row.found) enums.push({sql: query})
    }
    const desired = yield* scratch(sp, function* (inner) {
      // A fresh name, so an existing schema is never touched
      const scratchSchema = `rado_push_${Math.random().toString(36).slice(2)}`
      yield inner.run(sql`create schema ${sql.identifier(scratchSchema)}`)
      yield* prepend(inner, scratchSchema)
      for (const query of shadow(api, api.name, scratchSchema).create())
        yield inner.run(query)
      return (yield* inspect(inner, api.name, scratchSchema))!
    })
    return [
      ...enums,
      ...renamed,
      ...(yield* changes(
        sp,
        api,
        schema,
        target,
        live,
        desired,
        home,
        options,
        tables
      ))
    ]
  })
}

function* changes(
  tx: Database,
  api: TableApi,
  schema: string,
  // The resolved table, a temporary table of the same name can't shadow it
  target: Sql,
  live: TableInfo,
  desired: TableInfo,
  home: string,
  options: PushOptions,
  tables: Array<TableApi>
): Gen<Array<Step>> {
  const data = columns(api)
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
  const fks = foreignKeyChanges(api, live, home)
  // Rows a policy hides would pass the data checks, so the checks run with
  // row security off, which fails instead of hiding them
  if (!options.force) yield tx.run(sql`set local row_security = off`)
  let changes: Changes
  try {
    changes = yield* compare(tx, target, api.name, live, desired, widens)
  } catch (error) {
    if (!/row-level security/.test(String(error))) throw error
    throw new Error(
      `Push can't check the rows of "${api.name}" behind row level security, pass force`,
      {cause: error}
    )
  }
  const {dropped, added, changed, risks, nulls} = changes
  const defs = new Set(values(desired.constraints))
  const liveDefs = new Set(values(live.constraints))
  const indexes = api.indexes()
  const gone = [
    ...differ(live.indexes, desired.indexes),
    ...entries(live.constraints)
      .filter(([, def]) => !defs.has(def))
      .map(([name]) => name)
  ]
  // Foreign keys of other pushed tables on a key that goes are dropped
  // first, the other table's own plan adds them back
  const dependents: Array<Record<string, string>> = gone.length
    ? yield tx.all(sql`select n.nspname as schema, r.relname as table,
i.relname as key, format('alter table %I.%I drop constraint %I', n.nspname,
r.relname, c.conname) as sql from pg_constraint c join pg_class r on r.oid =
c.conrelid join pg_namespace n on n.oid = r.relnamespace join pg_class i on
i.oid = c.conindid where c.contype = 'f' and c.conrelid <> c.confrelid and
c.confrelid = ${sql.inline(tx.dialect.inline(target))}::regclass`)
    : []
  const steps: Array<Step> = [
    ...dependents
      .filter(
        fk =>
          gone.includes(fk.key) &&
          tables.some(
            other =>
              other.name === fk.table &&
              (other.schemaName ?? home) === fk.schema
          )
      )
      .map(fk => ({sql: sql.unsafe(fk.sql)})),
    ...fks.dropped.map(fk =>
      alter(sql`drop constraint ${sql.identifier(fk.name!)}`)
    ),
    ...gone.map(name =>
      live.indexes[name]
        ? {
            sql: sql`drop index ${sql.identifier(schema)}.${sql.identifier(name)}`
          }
        : alter(sql`drop constraint ${sql.identifier(name)}`)
    ),
    ...dropped.map(name =>
      alter(sql`drop column ${sql.identifier(name)}`, risks[name])
    ),
    ...added.map(name => ({
      ...alter(sql`add column ${bare.columnDefinition(data[name].key)}`),
      effect: draws(name)
    }))
  ]
  for (const name of changed) {
    const from = live.columns[name]
    const to = desired.columns[name]
    const id = sql.identifier(name)
    const column = sql`alter column ${id}`
    const kind = sql.unsafe(to.extra === 'a' ? 'always' : 'by default')
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
      const qualified = sql.inline(
        `${tx.dialect.inline(sql.identifier(schema))}.${sequence}`
      )
      steps.push(
        {
          sql: sql`create sequence ${sql.identifier(
            schema
          )}.${sql.unsafe(sequence)} owned by ${target}.${id}`
        },
        {
          sql: sql`select setval(${qualified}, greatest(coalesce(max(${id}), 0) + 1, 1), false) from ${target}`
        },
        alter(sql`${column} set default nextval(${qualified})`)
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
          sql: sql`update ${target} set ${id} = (${fallback}) where ${id} is null`.inlineValues(),
          risk,
          // An update can fire triggers
          effect: true
        })
      steps.push(
        alter(
          sql`${column} ${sql.unsafe(to.notNull ? 'set' : 'drop')} not null`,
          fallback ? undefined : risk
        )
      )
    }
    if (to.extra && from.extra !== to.extra) {
      // A serial's sequence goes with its default, so the identity's own
      // sequence is the one that continues above the rows
      const owned: {seq: string | null} = yield tx.get(
        sql`select pg_get_serial_sequence(${sql.inline(
          tx.dialect.inline(target)
        )}, ${sql.inline(name)}) as seq`
      )
      if (!from.extra && owned.seq)
        steps.push({sql: sql`drop sequence ${sql.unsafe(owned.seq)}`})
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
          sql: sql`select setval(pg_get_serial_sequence(${sql.inline(
            tx.dialect.inline(target)
          )}, ${sql.inline(name)}), greatest(coalesce(max(${id}), 0) + 1, 1), false) from ${target}`
        })
    }
  }
  return [
    ...steps,
    ...entries(desired.constraints)
      .filter(([, def]) => !liveDefs.has(def))
      .map(([name, def]) =>
        alter(sql`add constraint ${sql.identifier(name)} ${sql.unsafe(def)}`)
      ),
    ...fks.added.map(fk =>
      alter(sql`add ${foreignKey({...fk, schema: fk.schema ?? home})}`)
    ),
    ...differ(desired.indexes, live.indexes).map(name => ({
      sql: getData(indexes[name]).toSql(api.name, name, false, schema)
    }))
  ]
}

export const push: Push<'postgres'> = createPush('postgres', plan)
