import type {Database} from '../core/Database.ts'
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
  renameSteps,
  shadow,
  transaction
} from '../core/Push.ts'
import {type Sql, sql} from '../core/Sql.ts'
import type {TableApi} from '../core/Table.ts'
import {inspect} from './inspect.ts'

export type {PushInput, PushOptions} from '../core/Push.ts'

const {entries, fromEntries, values} = Object

function* plan(
  tx: Database,
  api: TableApi,
  options: PushOptions
): Gen<Array<Step>> {
  const before = yield* inspect(tx, api.name)
  if (!before) return api.create().map(sql => ({sql}))
  const renamed = renameSteps(api, before, options)
  const live = renamed.length
    ? (yield* inspect(
        tx,
        api.name,
        fromEntries(renamed.map(([from, to]) => [from, to]))
      ))!
    : before
  const copy = shadow(api, `__rado_${api.name}`)
  const drop = sql`drop table if exists ${copy.identifier()}`
  let desired: TableInfo
  yield tx.run(drop)
  try {
    for (const query of copy.create()) yield tx.run(query)
    desired = (yield* inspect(tx, copy.name))!
  } finally {
    yield tx.run(drop)
  }
  const original = fromEntries(renamed.map(([from, to]) => [to, from]))
  return [
    ...renamed.map(([, , step]) => step),
    ...(yield* changes(tx, api, live, desired, original))
  ]
}

function* changes(
  tx: Database,
  api: TableApi,
  live: TableInfo,
  desired: TableInfo,
  original: Record<string, string>
): Gen<Array<Step>> {
  const target = api.identifier()
  const data = columns(api)
  const bare = shadow(api, api.name, undefined, true)
  const alter = (change: Sql, risk?: string): Step => ({
    sql: sql`alter table ${target} ${change}`,
    risk
  })
  const fks = foreignKeyChanges(api, live)
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
    name => original[name] ?? name
  )
  const primary = desired.constraints.primary
  const pkChanged = live.constraints.primary !== primary
  const steps: Array<Step> = [
    ...fks.dropped.map(fk =>
      alter(sql`drop foreign key ${sql.identifier(fk.name!)}`)
    ),
    ...differ(live.indexes, desired.indexes)
      .filter(name => !implicit.has(name))
      .map(name => alter(sql`drop index ${sql.identifier(name)}`)),
    ...(pkChanged && live.constraints.primary
      ? [alter(sql`drop primary key`)]
      : []),
    ...dropped.map(name =>
      alter(sql`drop column ${sql.identifier(name)}`, risks[name])
    ),
    ...added.map(name =>
      alter(sql`add column ${bare.columnDefinition(data[name].key)}`)
    )
  ]
  for (const name of changed) {
    const fallback = data[name].defaultValue
    const column = sql.identifier(name)
    if (nulls[name] && fallback)
      steps.push({
        sql: sql`update ${target} set ${column} = (${fallback}) where ${column} is null`.inlineValues(),
        risk: nulls[name]
      })
    // Modify takes the whole definition, it resets what it leaves out
    steps.push(
      alter(
        sql`modify column ${bare.columnDefinition(data[name].key)}`,
        risks[name] ?? (fallback ? undefined : nulls[name])
      )
    )
  }
  return [
    ...steps,
    ...(pkChanged && primary ? [alter(sql.unsafe(`add ${primary}`))] : []),
    ...differ(desired.indexes, live.indexes).map(name => {
      const def = desired.indexes[name]
      const unique = def.startsWith('unique ')
      return alter(
        sql`add ${sql.unsafe(unique ? 'unique ' : '')}index ${sql.identifier(
          name
        )} ${sql.unsafe(unique ? def.slice(7) : def)}`
      )
    }),
    ...fks.added.map(fk => alter(sql`add ${foreignKey(fk)}`))
  ]
}

// MySQL commits implicitly after each DDL statement, so each table gets a
// transaction of its own
const runner: Runner = function* (db, apply) {
  yield* apply(db)
}

export const push: Push = createPush('mysql', plan, runner)
