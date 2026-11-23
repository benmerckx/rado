import type {Database} from './Database.ts'
import {columns, isForeignKey} from './ForeignKey.ts'
import {getData, internalData} from './Internal.ts'
import type {Deliver, QueryDialect, QueryMeta, Runtime} from './MetaData.ts'
import {order, tables} from './Order.ts'
import type {Shape} from './Shape.ts'
import {type Sql, sql} from './Sql.ts'
import type {TableApi, TableConfigResult} from './Table.ts'
import {exec, type Gen, within} from './Transaction.ts'

export interface PushOptions {
  force?: boolean
  rename?: Record<string, string>
}

// A module namespace or object literal, values that aren't tables are
// ignored
export type Schema = object

// A dialect entry only accepts a database of its dialect
export interface Push<D extends QueryDialect = QueryDialect> {
  <Meta extends QueryMeta & {dialect: D}>(
    db: Database<Meta>,
    schema: Schema,
    options?: PushOptions
  ): Deliver<Meta, void>
  plan<Meta extends QueryMeta & {dialect: D}>(
    db: Database<Meta>,
    schema: Schema,
    options?: PushOptions
  ): Deliver<Meta, Array<string>>
}

// Generate plans without rows to check, see Comparison.assume
export interface PlanOptions extends PushOptions {
  assume?: boolean
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
    options: PlanOptions,
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
) => Gen<Array<Statement>>

export interface Runner {
  (db: Database, apply: Apply, dry: boolean): Gen<Array<Statement>>
}

// A statement push runs, with what it may lose
export interface Statement {
  sql: string
  risk?: string
}

type Mode = 'push' | 'plan' | 'capture'
type Run = (
  db: Database,
  schema: Schema,
  mode: Mode,
  options?: PushOptions
) => Array<Statement> | Promise<Array<Statement>>

const runs = new WeakMap<object, Run>()

// Applies everything, risky or not, and returns what ran, for generate
export function capture(
  push: Push,
  db: Database,
  schema: Schema,
  options?: PushOptions
): Array<Statement> | Promise<Array<Statement>> {
  return runs.get(push)!(db, schema, 'capture', options)
}

const single: Runner = (db, apply, dry) =>
  within(db, tx => apply(tx, true), dry)

export function createPush<R extends Runtime>(
  runtime: R,
  planner: Planner,
  runner = single,
  validate?: (api: TableApi) => void
): Push<R> {
  const go: Run = (db, schema, mode, options = {}) => {
    const dry = mode === 'plan'
    const assume = mode === 'capture'
    if (db.dialect.runtime !== runtime)
      throw new Error(`Expected a ${runtime} database`)
    if (!db.driver.supportsTransactions)
      throw new Error('Push needs a driver with transactions')
    const found = tables(schema)
    for (const api of found) {
      if (api.temporary) throw new Error('Temporary tables cannot be pushed')
      validate?.(api)
      renames(api, options)
    }
    for (const from of Object.keys(options.rename ?? {}))
      if (!found.some(api => from.startsWith(prefix(api))))
        throw new Error(`Rename "${from}" is not a column of a pushed table`)
    const ordered = order(found)
    return exec(
      runner(
        db,
        function* (tx, execute, check) {
          const result: Array<Statement> = []
          for (const api of ordered) {
            const steps = yield* planner(tx, api, {...options, assume}, ordered)
            const risky =
              !options.force && !assume && steps.find(step => step.risk)
            if (risky && !dry)
              throw new Error(
                `Push would ${risky.risk}: ${db.dialect.inline(risky.sql)}`
              )
            check?.(steps)
            result.push(
              ...steps.map(step => ({
                sql: db.dialect.inline(step.sql),
                risk: step.risk
              }))
            )
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
  const sqls = (statements: Array<Statement>) => statements.map(s => s.sql)
  const push = (db: Database, schema: Schema, options?: PushOptions) => {
    const result = go(db, schema, 'push', options)
    if (result instanceof Promise) return result.then(() => {})
  }
  push.plan = (db: Database, schema: Schema, options?: PushOptions) => {
    const result = go(db, schema, 'plan', options)
    return result instanceof Promise ? result.then(sqls) : sqls(result)
  }
  runs.set(push, go)
  return push as Push<R>
}

// Keys of a that b lacks or defines differently
export function differ<T>(
  a: Record<string, T>,
  b: Record<string, T>
): Array<string> {
  return Object.keys(a).filter(key => a[key] !== b[key])
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
  return Object.assign(Object.create(Object.getPrototypeOf(api)), {
    ...api,
    name,
    alias: undefined,
    schemaName,
    columns: Object.fromEntries(
      Object.entries(api.columns).map(([key, column]) => [
        key,
        {[internalData]: {...getData(column), ...strip, references: undefined}}
      ])
    ),
    config:
      config &&
      ((): TableConfigResult => {
        const result = config()
        if (Array.isArray(result)) return result.filter(keep)
        return Object.fromEntries(
          Object.entries(result).filter(([, value]) => keep(value))
        )
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
  return Object.entries(options.rename ?? {})
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
