import {run} from '../universal/transactions.ts'
import type {ColumnData, ReferenceOptions} from './Column.ts'
import {type Database, Rollback} from './Database.ts'
import type {FieldData} from './expr/Field.ts'
import {getData, getTable, hasTable, internalData} from './Internal.ts'
import type {Deliver, QueryMeta, Runtime} from './MetaData.ts'
import {type Sql, sql} from './Sql.ts'
import type {Table, TableApi, TableConfigResult} from './Table.ts'

const {assign, create, entries, fromEntries, getPrototypeOf, keys} = Object

export interface PushOptions {
  force?: boolean
  rename?: Record<string, string>
}

export type PushInput = Array<Table> | [...Array<Table>, PushOptions]

export interface Push {
  <Meta extends QueryMeta>(
    db: Database<Meta>,
    ...input: PushInput
  ): Deliver<Meta, void>
  plan<Meta extends QueryMeta>(
    db: Database<Meta>,
    ...input: PushInput
  ): Deliver<Meta, Array<string>>
}

export interface Step {
  sql: Sql
  risk?: string
  rebuild?: boolean
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
}

export type Gen<T> = Generator<unknown, T, any>

export interface Planner {
  (tx: Database, api: TableApi, options: PushOptions): Gen<Array<Step>>
}

type Apply = (tx: Database, check?: (steps: Array<Step>) => void) => Gen<void>

export interface Runner {
  (db: Database, apply: Apply): Gen<void>
}

export function exec<T>(gen: Gen<T>): T | Promise<T> {
  return run(gen, value => value)
}

export function transaction<T>(
  db: Database,
  inner: (tx: Database) => Gen<T>
): unknown {
  return db.transaction(tx => exec(inner(tx)))
}

// Runs inside a savepoint that is always rolled back
export function* scratch<T>(
  tx: Database,
  inner: (sp: Database) => Gen<T>
): Gen<T> {
  try {
    yield transaction(tx, function* (sp) {
      throw new Rollback(yield* inner(sp))
    })
  } catch (error) {
    if (error instanceof Rollback) return error.data as T
    throw error
  }
  return undefined as never
}

const single: Runner = function* (db, apply) {
  yield transaction(db, apply)
}

export function createPush(
  runtime: Runtime,
  planner: Planner,
  runner = single
): Push {
  function prepare(db: Database, input: PushInput) {
    if (db.dialect.runtime !== runtime)
      throw new Error(`Expected a ${runtime} database`)
    const last = input.at(-1)
    const options = last && !hasTable(last) ? (last as PushOptions) : {}
    const tables = (input.filter(hasTable) as Array<Table>).map(getTable)
    for (const api of tables) {
      if (api.temporary) throw new Error('Temporary tables cannot be pushed')
      renameSteps(api, {columns: {}} as TableInfo, options)
    }
    return {tables: order(tables), options}
  }
  const push = (db: Database, ...input: PushInput) => {
    const {tables, options} = prepare(db, input)
    return exec(
      runner(db, function* (tx, check) {
        for (const api of tables) {
          const steps = yield* planner(tx, api, options)
          if (!options.force)
            for (const step of steps)
              if (step.risk)
                throw new Error(
                  `Push would ${step.risk}: ${db.dialect.inline(step.sql)}`
                )
          check?.(steps)
          if (steps.length > 0)
            yield tx.batch(steps.map(step => step.sql)).run()
        }
      })
    )
  }
  push.plan = (db: Database, ...input: PushInput) => {
    const {tables, options} = prepare(db, input)
    return transaction(db, function* (tx) {
      const result: Array<string> = []
      for (const api of tables)
        for (const step of yield* planner(tx, api, options))
          result.push(db.dialect.inline(step.sql))
      return result
    })
  }
  return push as Push
}

// Referenced tables first, so foreign keys can be created
function order(tables: Array<TableApi>): Array<TableApi> {
  const byName = new Map(tables.map(api => [api.name, api]))
  const result: Array<TableApi> = []
  const seen = new Set<TableApi>()
  const visit = (api: TableApi) => {
    if (seen.has(api)) return
    seen.add(api)
    for (const fk of foreignKeys(api)) {
      const dependency = byName.get(fk.table)
      if (dependency) visit(dependency)
    }
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
  return `(${fk.columns}) ${fk.table}(${fk.references}) ${fk.onDelete} ${fk.onUpdate}`
}

export function foreignKeyChanges(api: TableApi, live: TableInfo) {
  const wanted = foreignKeys(api)
  const current = new Set(live.foreignKeys.map(signature))
  const kept = new Set(wanted.map(signature))
  return {
    dropped: live.foreignKeys.filter(fk => !kept.has(signature(fk))),
    added: wanted.filter(fk => !current.has(signature(fk)))
  }
}

export function foreignKey(fk: ForeignKeyInfo): Sql {
  const list = (names: Array<string>) =>
    sql.join(names.map(sql.identifier), sql`, `)
  return sql.join([
    fk.name && !fk.inline
      ? sql`constraint ${sql.identifier(fk.name)}`
      : undefined,
    sql`foreign key (${list(fk.columns)})`,
    sql`references ${sql.identifier(fk.table)} (${list(fk.references)})`,
    fk.onDelete !== 'no action' && sql`on delete ${sql.unsafe(fk.onDelete)}`,
    fk.onUpdate !== 'no action' && sql`on update ${sql.unsafe(fk.onUpdate)}`
  ])
}

// Keys of a that b lacks or defines differently
export function differ<T>(a: Record<string, T>, b: Record<string, T>) {
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

// Rename hints for this table that still apply to the live columns
export function renameSteps(
  api: TableApi,
  live: TableInfo,
  options: PushOptions
): Array<[from: string, to: string, step: Step]> {
  const prefix = `${api.schemaName ? `${api.schemaName}.` : ''}${api.name}.`
  const known = columns(api)
  return entries(options.rename ?? {})
    .filter(([from]) => from.startsWith(prefix))
    .map(([from, to]): [string, string] => {
      if (!known[to]) throw new Error(`Unknown column "${to}" in rename`)
      return [from.slice(prefix.length), to]
    })
    .filter(([from]) => live.columns[from])
    .map(([from, to]) => {
      if (live.columns[to])
        throw new Error(`Cannot rename "${from}" to "${to}", both exist`)
      return [
        from,
        to,
        {
          sql: sql`alter table ${api.identifier()} rename column ${sql.identifier(
            from
          )} to ${sql.identifier(to)}`
        }
      ]
    })
}

const integers = [
  'tinyint smallint mediumint int bigint',
  'smallint integer bigint'
].map(family => family.split(' '))
const texts = 'char,character,varchar,character varying,text'.split(',')

function parse(type: string) {
  const [, base, args] = type.match(/^([^(]*?)\s*(?:\((.*)\))?\s*$/)!
  return {base, args: args ? args.split(',').map(Number) : []}
}

// Whether every value of one type fits into another without loss
export function widens(from: string, to: string): boolean {
  const a = parse(from)
  const b = parse(to)
  if (a.base === b.base)
    return (
      b.args.length === 0 ||
      (a.args.length === b.args.length &&
        a.args.every((arg, i) => arg <= b.args[i]))
    )
  if (texts.includes(a.base) && b.base.endsWith('text') && !b.args.length)
    return true
  return integers.some(family => {
    const i = family.indexOf(a.base)
    return i > -1 && family.indexOf(b.base) > i
  })
}

export interface Changes {
  hasRows: boolean
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
  source = (name: string) => name
): Gen<Changes> {
  const hasRows = yield* exists(tx, target)
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
  if (hasRows) {
    for (const name of added)
      if (b[name].notNull && b[name].default === null && !b[name].extra)
        throw new Error(
          `Cannot add not null column "${name}" without a default to "${table}"`
        )
    for (const name of dropped)
      if (yield* has(name, false))
        risks[name] = `drop column "${name}" with data`
    for (const name of changed) {
      const from = a[name]
      const to = b[name]
      if (
        from.type !== to.type &&
        !widens(from.type, to.type) &&
        (yield* has(name, false))
      )
        risks[name] = `change column "${name}" from ${from.type} to ${to.type}`
      if (to.notNull && !from.notNull && (yield* has(name, true)))
        nulls[name] = `make column "${name}" not null over null values`
    }
  }
  return {hasRows, dropped, added, changed, risks, nulls}
}
