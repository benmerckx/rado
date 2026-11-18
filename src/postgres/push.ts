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
  renameSteps,
  scratch,
  shadow
} from '../core/Push.ts'
import {type Sql, sql} from '../core/Sql.ts'
import type {TableApi} from '../core/Table.ts'
import {inspect} from './inspect.ts'

export type {PushInput, PushOptions} from '../core/Push.ts'

const {entries, values} = Object
const scratchSchema = 'rado_push'

function* plan(
  tx: Database,
  api: TableApi,
  options: PushOptions
): Gen<Array<Step>> {
  const schema: string =
    api.schemaName ??
    ((yield tx.get(sql`select current_schema() as name`)) as {name: string})
      .name
  const before = yield* inspect(tx, api.name, schema)
  if (!before) return api.create().map(sql => ({sql}))
  const renamed = renameSteps(api, before, options).map(([, , step]) => step)
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
      const scratch = sql.identifier(scratchSchema)
      yield inner.run(sql`create schema ${scratch}`)
      yield inner.run(
        sql`set local search_path to ${scratch}, ${sql.unsafe(path)}`
      )
      for (const query of shadow(api, api.name, scratchSchema).create())
        yield inner.run(query)
      return (yield* inspect(inner, api.name, scratchSchema))!
    })
    const target = sql`${sql.identifier(schema)}.${sql.identifier(api.name)}`
    return [
      ...enums,
      ...renamed,
      ...(yield* changes(sp, api, target, live, desired))
    ]
  })
}

function* changes(
  tx: Database,
  api: TableApi,
  qualified: Sql,
  live: TableInfo,
  desired: TableInfo
): Gen<Array<Step>> {
  const target = api.identifier()
  const data = columns(api)
  const bare = shadow(api, api.name, api.schemaName, true)
  const alter = (change: Sql, risk?: string): Step => ({
    sql: sql`alter table ${target} ${change}`,
    risk
  })
  const fks = foreignKeyChanges(api, live)
  const {dropped, added, changed, risks, nulls} = yield* compare(
    tx,
    qualified,
    api.name,
    live,
    desired
  )
  const defs = new Set(values(desired.constraints))
  const liveDefs = new Set(values(live.constraints))
  const indexes = api.indexes()
  const steps: Array<Step> = [
    ...differ(live.indexes, desired.indexes).map(name => ({
      sql: sql`drop index ${sql.join(
        [api.schemaName!, name].filter(Boolean).map(sql.identifier),
        sql`.`
      )}`
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
    ...added.map(name =>
      alter(sql`add column ${bare.columnDefinition(data[name].key)}`)
    )
  ]
  for (const name of changed) {
    const from = live.columns[name]
    const to = desired.columns[name]
    const column = sql`alter column ${sql.identifier(name)}`
    if (from.type !== to.type) {
      const type = sql.unsafe(to.type)
      steps.push(
        alter(
          sql`${column} type ${type} using ${sql.identifier(name)}::${type}`,
          risks[name]
        )
      )
    }
    if (from.default !== to.default)
      steps.push(
        alter(
          to.default === null
            ? sql`${column} drop default`
            : sql`${column} set default ${sql.unsafe(to.default)}`
        )
      )
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
    }
    if (from.notNull === to.notNull) continue
    const fallback = data[name].defaultValue
    const risk = nulls[name]
    if (risk && fallback)
      steps.push({
        sql: sql`update ${target} set ${sql.identifier(name)} = (${fallback}) where ${sql.identifier(name)} is null`.inlineValues(),
        risk
      })
    steps.push(
      alter(
        sql`${column} ${sql.unsafe(to.notNull ? 'set' : 'drop')} not null`,
        fallback ? undefined : risk
      )
    )
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
      sql: getData(indexes[name]).toSql(api.name, name, false)
    }))
  ]
}

export const push: Push = createPush('postgres', plan)
