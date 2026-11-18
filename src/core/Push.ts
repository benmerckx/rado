import {run} from '../universal/transactions.ts'
import type {ColumnData, ReferenceOptions} from './Column.ts'
import {type Database, Rollback, type TransactionOptions} from './Database.ts'
import type {FieldData} from './expr/Field.ts'
import {getData, getTable, hasTable, internalData} from './Internal.ts'
import type {Deliver, QueryDialect, QueryMeta, Runtime} from './MetaData.ts'
import {type Sql, sql} from './Sql.ts'
import type {Table, TableApi, TableConfigResult} from './Table.ts'

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

export interface ColumnInfo {
  type: string
  notNull: boolean
  default: string | null
  extra: string
}

export interface ForeignKeyInfo {
  name?: string
  columns: Array<string>
  schema?: string
  table: string
  references: Array<string>
  onDelete: string
  onUpdate: string
  inline?: boolean
}

export interface TableInfo {
  columns: Record<string, ColumnInfo>
  constraints: Record<string, string>
  indexes: Record<string, string>
  foreignKeys: Array<ForeignKeyInfo>
  rowid?: string | false
}

export type Gen<T> = Generator<unknown, T, any>

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

export function exec<T>(gen: Gen<T>): T | Promise<T> {
  return run(gen, value => value)
}

export function transaction<T>(
  db: Database,
  inner: (tx: Database) => Gen<T>,
  options?: TransactionOptions['sqlite']
): unknown {
  return db.transaction(tx => exec(inner(tx)), options as never)
}

// Runs inside a transaction or savepoint that is always rolled back
export function* scratch<T>(
  tx: Database,
  inner: (sp: Database) => Gen<T>,
  options?: TransactionOptions['sqlite']
): Gen<T> {
  try {
    yield transaction(
      tx,
      function* (sp) {
        throw new Rollback(yield* inner(sp))
      },
      options
    )
  } catch (error) {
    if (error instanceof Rollback) return error.data as T
    throw error
  }
  return undefined as never
}

// A dry run applies everything and rolls it back
export function* within<T>(
  db: Database,
  inner: (tx: Database) => Gen<T>,
  dry: boolean,
  options?: TransactionOptions['sqlite']
): Gen<T> {
  if (dry) return yield* scratch(db, inner, options)
  return (yield transaction(db, inner, options)) as T
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

const key = (schema: string | undefined, name: string) =>
  `${schema ?? ''}.${name}`

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
    for (const fk of foreignKeys(api)) {
      const dependency = byName.get(key(fk.schema, fk.table))
      if (!dependency || dependency === api) continue
      if (visiting.has(dependency))
        throw new Error(
          `Foreign keys form a cycle between "${dependency.name}" and "${api.name}"`
        )
      visit(dependency)
    }
    visiting.delete(api)
    result.push(api)
  }
  for (const api of tables) visit(api)
  return result
}

export function* exists(
  tx: Database,
  target: Sql,
  where = sql`1 = 1`
): Gen<boolean> {
  return Boolean(
    yield tx.get(sql`select 1 as found from ${target} where ${where} limit 1`)
  )
}

// Column data and the property key, by database column name
export function columns(
  api: TableApi
): Record<string, ColumnData & {key: string}> {
  return fromEntries(
    entries(api.columns).map(([key, column]) => {
      const data = getData(column)
      return [data.name ?? key, {...data, key}]
    })
  )
}

function configEntries(config?: TableConfigResult) {
  if (!config) return []
  if (Array.isArray(config)) return config.map(value => [undefined, value])
  return entries(config)
}

const isForeignKey = (value: any) =>
  Boolean((getData(value) as {references?: unknown})?.references)

export function foreignKeys(api: TableApi): Array<ForeignKeyInfo> {
  const result: Array<ForeignKeyInfo> = []
  const add = (
    columns: Array<string>,
    fields: Array<FieldData>,
    options: ReferenceOptions = {},
    name?: string,
    inline = false
  ) =>
    result.push({
      name,
      columns,
      schema: fields[0].schemaName,
      table: fields[0].targetName,
      references: fields.map(field => field.fieldName),
      onDelete: options.onDelete ?? 'no action',
      onUpdate: options.onUpdate ?? 'no action',
      inline
    })
  for (const [name, data] of entries(columns(api)))
    if (data.references)
      add([name], [data.references()], data.referenceOptions, name, true)
  for (const [key, value] of configEntries(api.config?.()))
    if (isForeignKey(value)) {
      const {name = key, fields, references} = getData<any>(value)
      add(
        fields.map((field: FieldData) => field.fieldName),
        references,
        {},
        name
      )
    }
  return result
}

export function signature(fk: ForeignKeyInfo): string {
  return `(${fk.columns}) ${key(fk.schema, fk.table)}(${fk.references}) ${fk.onDelete} ${fk.onUpdate}`
}

// Unqualified references resolve to the home schema
export function foreignKeyChanges(
  api: TableApi,
  live: TableInfo,
  home?: string
): {dropped: Array<ForeignKeyInfo>; added: Array<ForeignKeyInfo>} {
  const local = (fk: ForeignKeyInfo) =>
    signature({...fk, schema: fk.schema === home ? undefined : fk.schema})
  const wanted = foreignKeys(api)
  const current = new Set(live.foreignKeys.map(local))
  const kept = new Set(wanted.map(local))
  return {
    dropped: live.foreignKeys.filter(fk => !kept.has(local(fk))),
    added: wanted.filter(fk => !current.has(local(fk)))
  }
}

export function foreignKey(fk: ForeignKeyInfo): Sql {
  const list = (names: Array<string>) =>
    sql.join(names.map(sql.identifier), sql`, `)
  const table = sql.identifier(fk.table)
  return sql.join([
    fk.name && !fk.inline
      ? sql`constraint ${sql.identifier(fk.name)}`
      : undefined,
    sql`foreign key (${list(fk.columns)})`,
    sql`references ${
      fk.schema ? sql`${sql.identifier(fk.schema)}.${table}` : table
    } (${list(fk.references)})`,
    fk.onDelete !== 'no action' && sql`on delete ${sql.unsafe(fk.onDelete)}`,
    fk.onUpdate !== 'no action' && sql`on update ${sql.unsafe(fk.onUpdate)}`
  ])
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
  return {
    sql: sql`alter table ${target} rename column ${sql.identifier(
      from
    )} to ${sql.identifier(to)}`
  }
}

// Hints that still apply to the live columns, as from and to
export function renameSteps(
  api: TableApi,
  live: TableInfo,
  options: PushOptions
): Array<[from: string, to: string]> {
  return renames(api, options).filter(([from, to]) => {
    if (live.columns[from] && live.columns[to])
      throw new Error(`Cannot rename "${from}" to "${to}", both exist`)
    return live.columns[from]
  })
}

export interface ParsedType {
  base: string
  args: Array<number>
}

export function parseType(type: string): ParsedType {
  const [, name, args, rest] = type.match(/^([^(]*)(?:\(([^)]*)\))?(.*)$/)!
  return {
    base: [name.trim(), rest.trim()].filter(Boolean).join(' '),
    args: args ? args.split(',').map(Number) : []
  }
}

// Same type with arguments at least as large, where fill gives the
// arguments a type has when they are left out
export function grows(
  a: ParsedType,
  b: ParsedType,
  fill: (base: string) => Array<number>
): boolean {
  const x = a.args.length ? a.args : fill(a.base)
  const y = b.args.length ? b.args : fill(b.base)
  if (a.base !== b.base || x.length !== y.length) return false
  // Precision and scale: neither the digits after nor before the point drop
  if (x.length === 2)
    return y[0] === Infinity || (x[1] <= y[1] && x[0] - x[1] <= y[0] - y[1])
  return x.every((arg, i) => arg <= y[i])
}

// Whether one is listed after the other in an ordered family
export function ranks(family: string, from: string, to: string): boolean {
  const list = family.split(' ')
  const i = list.indexOf(from)
  return i > -1 && list.indexOf(to) > i
}

export interface Changes {
  // Whether the target holds rows, only queried when asked
  hasRows: () => Gen<boolean>
  dropped: Array<string>
  added: Array<string>
  changed: Array<string>
  risks: Record<string, string>
  nulls: Record<string, string>
}

// Compares columns and finds the changes that would lose data
export function* compare(
  tx: Database,
  target: Sql,
  table: string,
  live: TableInfo,
  desired: TableInfo,
  widens: (from: string, to: string) => boolean,
  source = (name: string) => name,
  // Why rows can't be checked, drops and narrowing then always count
  unchecked?: string
): Gen<Changes> {
  let found: boolean | undefined
  const hasRows = function* () {
    return (found ??= yield* exists(tx, target))
  }
  const a = live.columns
  const b = desired.columns
  const dropped = keys(a).filter(name => !b[name])
  const added = keys(b).filter(name => !a[name])
  const changed = keys(b).filter(
    name =>
      a[name] &&
      (['type', 'notNull', 'default', 'extra'] as const).some(
        key => a[name][key] !== b[name][key]
      )
  )
  const risks: Record<string, string> = {}
  const nulls: Record<string, string> = {}
  const has = (name: string, nulls: boolean) =>
    exists(
      tx,
      target,
      sql`${sql.identifier(source(name))} is ${sql.unsafe(nulls ? '' : 'not ')}null`
    )
  const loses = function* (name: string) {
    return unchecked || (yield* has(name, false))
  }
  const note = unchecked ? ` (${unchecked})` : ''
  for (const name of added)
    if (
      b[name].notNull &&
      b[name].default === null &&
      !b[name].extra &&
      (yield* hasRows())
    )
      throw new Error(
        `Cannot add not null column "${name}" without a default to "${table}"`
      )
  for (const name of dropped)
    if (yield* loses(name))
      risks[name] = `drop column "${name}"${note || ' with data'}`
  for (const name of changed) {
    const from = a[name]
    const to = b[name]
    if (
      from.type !== to.type &&
      !widens(from.type, to.type) &&
      (yield* loses(name))
    )
      risks[name] =
        `change column "${name}" from ${from.type} to ${to.type}${note}`
    if (to.notNull && !from.notNull && (yield* has(name, true)))
      nulls[name] = `make column "${name}" not null over null values`
  }
  return {hasRows, dropped, added, changed, risks, nulls}
}
