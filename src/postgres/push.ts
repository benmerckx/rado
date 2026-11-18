import type {Database} from '../core/Database.ts'
import {getData} from '../core/Internal.ts'
import {
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
import {inspect} from './inspect.ts'

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
  options: PushOptions
): Gen<Array<Step>> {
  const {home}: {home: string} = yield tx.get(
    sql`select current_schema() as home`
  )
  const schema = api.schemaName ?? home
  const target = sql`${sql.identifier(schema)}.${sql.identifier(api.name)}`
  const {found}: {found: unknown} = yield tx.get(
    sql`select to_regclass(format('%I.%I', ${schema}::text, ${api.name}::text)) as found`
  )
  if (!found) return api.create().map(sql => ({sql}))
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
      const {path}: {path: string} = yield inner.get(
        sql`select current_setting('search_path') as path`
      )
      // A fresh name, so an existing schema is never touched
      const scratchSchema = `rado_push_${Math.random().toString(36).slice(2)}`
      const scratch = sql.identifier(scratchSchema)
      yield inner.run(sql`create schema ${scratch}`)
      yield inner.run(
        sql`set local search_path to ${scratch}, ${sql.unsafe(path)}`
      )
      for (const query of shadow(api, api.name, scratchSchema).create())
        yield inner.run(query)
      return (yield* inspect(inner, api.name, scratchSchema))!
    })
    return [
      ...enums,
      ...renamed,
      ...(yield* changes(sp, api, schema, live, desired, home))
    ]
  })
}

function* changes(
  tx: Database,
  api: TableApi,
  schema: string,
  live: TableInfo,
  desired: TableInfo,
  home: string
): Gen<Array<Step>> {
  // The resolved table, a temporary table of the same name can't shadow it
  const target = sql`${sql.identifier(schema)}.${sql.identifier(api.name)}`
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
  const {dropped, added, changed, risks, nulls} = yield* compare(
    tx,
    target,
    api.name,
    live,
    desired,
    widens
  )
  const defs = new Set(values(desired.constraints))
  const liveDefs = new Set(values(live.constraints))
  const indexes = api.indexes()
  const steps: Array<Step> = [
    ...differ(live.indexes, desired.indexes).map(name => ({
      sql: sql`drop index ${sql.identifier(schema)}.${sql.identifier(name)}`
    })),
    ...fks.dropped.map(fk =>
      alter(sql`drop constraint ${sql.identifier(fk.name!)}`)
    ),
    ...entries(live.constraints)
      .filter(([, def]) => !defs.has(def))
      .map(([name]) => alter(sql`drop constraint ${sql.identifier(name)}`)),
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
    if (
      to.default !== null
        ? cleared || from.default !== to.default
        : !cleared && from.default !== null
    )
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
    if (from.extra !== to.extra) {
      const kind = sql.unsafe(to.extra === 'a' ? 'always' : 'by default')
      steps.push(
        alter(
          !to.extra
            ? sql`${column} drop identity`
            : from.extra
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
    ...fks.added.map(fk => alter(sql`add ${foreignKey(fk)}`)),
    ...differ(desired.indexes, live.indexes).map(name => ({
      sql: getData(indexes[name]).toSql(api.name, name, false, schema)
    }))
  ]
}

export const push: Push<'postgres'> = createPush('postgres', plan)
