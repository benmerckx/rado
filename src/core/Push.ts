import type {Database} from './Database.ts'
import {columns, foreignKeys, isForeignKey, key} from './ForeignKey.ts'
import {getData, getTable, hasTable, internalData} from './Internal.ts'
import type {Deliver, QueryDialect, QueryMeta, Runtime} from './MetaData.ts'
import type {Shape} from './Shape.ts'
import {type Sql, sql} from './Sql.ts'
import type {Table, TableApi, TableConfigResult} from './Table.ts'
import {exec, type Gen, within} from './Transaction.ts'

const {assign, create, entries, fromEntries, getPrototypeOf, keys} = Object

export interface PushOptions {
  force?: boolean
  rename?: Record<string, string>
}

export type PushInput = Array<Table> | [...Array<Table>, PushOptions]

// A dialect entry only accepts a database of its dialect
export interface Push<D extends QueryDialect = QueryDialect> {
  <Meta extends QueryMeta & {dialect: D}>(
    db: Database<Meta>,
    ...input: PushInput
  ): Deliver<Meta, void>
  plan<Meta extends QueryMeta & {dialect: D}>(
    db: Database<Meta>,
    ...input: PushInput
  ): Deliver<Meta, Array<string>>
}

export interface Step {
  sql: Sql
  risk?: string
  rebuild?: boolean
  // Changes something a rollback doesn't undo, such as a sequence
  effect?: boolean
}

export interface Planner {
  (
    tx: Database,
    api: TableApi,
    options: PushOptions,
    // Every table pushed, whose foreign keys may be dropped and re-added
    tables: Array<TableApi>
  ): Gen<Array<Step>>
}

// Plans each table and applies it when execute is set, so later tables are
// planned against the result
export type Apply = (
  tx: Database,
  execute: boolean,
  check?: (steps: Array<Step>) => void
) => Gen<Array<string>>

export interface Runner {
  (db: Database, apply: Apply, dry: boolean): Gen<Array<string>>
}

const single: Runner = (db, apply, dry) =>
  within(db, tx => apply(tx, true), dry)

export function createPush<R extends Runtime>(
  runtime: R,
  planner: Planner,
  runner = single,
  validate?: (api: TableApi) => void
): Push<R> {
  function go(db: Database, input: PushInput, dry: boolean) {
    if (db.dialect.runtime !== runtime)
      throw new Error(`Expected a ${runtime} database`)
    if (!db.driver.supportsTransactions)
      throw new Error('Push needs a driver with transactions')
    const last = input.at(-1)
    const options = last && !hasTable(last) ? (last as PushOptions) : {}
    const tables = (input.filter(hasTable) as Array<Table>).map(getTable)
    for (const api of tables) {
      if (api.temporary) throw new Error('Temporary tables cannot be pushed')
      validate?.(api)
      renames(api, options)
    }
    for (const from of keys(options.rename ?? {}))
      if (!tables.some(api => from.startsWith(prefix(api))))
        throw new Error(`Rename "${from}" is not a column of a pushed table`)
    const ordered = order(tables)
    return exec(
      runner(
        db,
        function* (tx, execute, check) {
          const result: Array<string> = []
          for (const api of ordered) {
            const steps = yield* planner(tx, api, options, ordered)
            const risky = !options.force && steps.find(step => step.risk)
            if (risky && !dry)
              throw new Error(
                `Push would ${risky.risk}: ${db.dialect.inline(risky.sql)}`
              )
            check?.(steps)
            result.push(...steps.map(step => db.dialect.inline(step.sql)))
            // A refused table is left as is, as push would stop there, and a
            // dry run skips tables it can't apply without leaving a trace
            const skip = risky || (dry && steps.some(step => step.effect))
            if (execute && !skip && steps.length > 0)
              yield tx.batch(steps.map(step => step.sql)).run()
          }
          return result
        },
        dry
      )
    )
  }
  const push = (db: Database, ...input: PushInput) => {
    const result = go(db, input, false)
    if (result instanceof Promise) return result.then(() => {})
  }
  push.plan = (db: Database, ...input: PushInput) => go(db, input, true)
  return push as Push<R>
}

// Referenced tables first, so foreign keys can be created
function order(tables: Array<TableApi>): Array<TableApi> {
  const byName = new Map(
    tables.map(api => [key(api.schemaName, api.name), api])
  )
  const result: Array<TableApi> = []
  const visiting = new Set<TableApi>()
  const visit = (api: TableApi) => {
    if (result.includes(api)) return
    visiting.add(api)
    for (const {schema, table} of foreignKeys(api)) {
      const dependency = byName.get(key(schema, table))
      if (!dependency || dependency === api) continue
      const pair = `"${dependency.name}" and "${api.name}"`
      if (visiting.has(dependency))
        throw new Error(`Foreign keys form a cycle between ${pair}`)
      visit(dependency)
    }
    visiting.delete(api)
    result.push(api)
  }
  for (const api of tables) visit(api)
  return result
}

// Keys of a that b lacks or defines differently
export function differ<T>(
  a: Record<string, T>,
  b: Record<string, T>
): Array<string> {
  return keys(a).filter(key => a[key] !== b[key])
}

// A copy of the table without foreign keys, so it can be created on its own,
// and with bare columns without key constraints, so they can be added
export function shadow(
  api: TableApi,
  name: string,
  schemaName?: string,
  bare = false
): TableApi {
  const strip = bare ? {primary: false, isUnique: false} : {}
  const config = api.config
  const keep = (value: unknown) => !isForeignKey(value)
  return assign(create(getPrototypeOf(api)), {
    ...api,
    name,
    alias: undefined,
    schemaName,
    columns: fromEntries(
      entries(api.columns).map(([key, column]) => [
        key,
        {[internalData]: {...getData(column), ...strip, references: undefined}}
      ])
    ),
    config:
      config &&
      ((): TableConfigResult => {
        const result = config()
        if (Array.isArray(result)) return result.filter(keep)
        return fromEntries(entries(result).filter(([, value]) => keep(value)))
      })
  })
}

const prefix = (api: TableApi) =>
  `${api.schemaName ? `${api.schemaName}.` : ''}${api.name}.`

// Rename hints for this table, checked against the desired columns
export function renames(
  api: TableApi,
  options: PushOptions
): Array<[from: string, to: string]> {
  const start = prefix(api)
  const known = columns(api)
  return entries(options.rename ?? {})
    .filter(([from]) => from.startsWith(start))
    .map(([from, to]) => {
      if (!known[to]) throw new Error(`Unknown column "${to}" in rename`)
      return [from.slice(start.length), to]
    })
}

export function renameColumn(target: Sql, [from, to]: [string, string]): Step {
  const names = sql`${sql.identifier(from)} to ${sql.identifier(to)}`
  return {sql: sql`alter table ${target} rename column ${names}`}
}

// Hints that still apply to the live columns, as from and to
export function renameSteps(
  api: TableApi,
  live: Shape,
  options: PushOptions
): Array<[from: string, to: string]> {
  return renames(api, options).filter(([from, to]) => {
    if (live.columns[from] && live.columns[to])
      throw new Error(`Cannot rename "${from}" to "${to}", both exist`)
    return live.columns[from]
  })
}
