import {run} from '../universal/transactions.ts'
import {Column, type ColumnData} from './Column.ts'
import {ForeignKeyConstraint} from './Constraint.ts'
import {type Database, Rollback} from './Database.ts'
import {getData} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'
import {TableApi, type TableConfigResult} from './Table.ts'

const {assign, entries, fromEntries} = Object

export interface PushOptions {
  force?: boolean
  rename?: Record<string, string>
}

export interface Step {
  sql: string
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

export function exec<T>(gen: Gen<T>): T | Promise<T> {
  return run(gen, value => value)
}

// Runs inside a savepoint that is always rolled back
export function* scratch<T>(
  tx: Database,
  inner: (sp: Database) => Gen<T>
): Gen<T> {
  try {
    yield tx.transaction(sp =>
      exec(
        (function* () {
          throw new Rollback(yield* inner(sp))
        })()
      )
    )
  } catch (error) {
    if (error instanceof Rollback) return error.data as T
    throw error
  }
  throw new Error('Expected rollback')
}

export function* exists(tx: Database, target: Sql, where?: Sql): Gen<boolean> {
  const query = sql.join([
    sql`select 1 as found from ${target}`,
    where && sql`where ${where}`,
    sql`limit 1`
  ])
  return Boolean(yield tx.get(query))
}

export function columnData(api: TableApi): Record<string, ColumnData> {
  return fromEntries(
    entries(api.columns).map(([key, column]) => {
      const data = getData(column)
      return [data.name ?? key, data]
    })
  )
}

function configEntries(config?: TableConfigResult) {
  if (!config) return []
  if (Array.isArray(config)) return config.map(value => [undefined, value])
  return entries(config)
}

export function foreignKeys(api: TableApi): Array<ForeignKeyInfo> {
  const result: Array<ForeignKeyInfo> = []
  for (const [name, data] of entries(columnData(api))) {
    if (!data.references) continue
    const field = data.references()
    result.push({
      columns: [name],
      table: field.targetName,
      references: [field.fieldName],
      onDelete: data.referenceOptions?.onDelete ?? 'no action',
      onUpdate: data.referenceOptions?.onUpdate ?? 'no action',
      inline: true
    })
  }
  for (const [key, value] of configEntries(api.config?.())) {
    if (!(value instanceof ForeignKeyConstraint)) continue
    const {name, fields, references} = getData(value)
    result.push({
      name: name ?? key,
      columns: fields.map(field => field.fieldName),
      table: references[0].targetName,
      references: references.map(field => field.fieldName),
      onDelete: 'no action',
      onUpdate: 'no action'
    })
  }
  return result
}

export function foreignKey(fk: ForeignKeyInfo): string {
  return `(${fk.columns}) ${fk.table}(${fk.references}) ${fk.onDelete} ${fk.onUpdate}`
}

export function addForeignKey(fk: ForeignKeyInfo): Sql {
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

// The desired table without foreign keys, so it can be created on its own
export function shadow(
  api: TableApi,
  name: string,
  schemaName?: string
): TableApi {
  const columns = fromEntries(
    entries(api.columns).map(([key, column]) => [
      key,
      new Column({
        ...getData(column),
        references: undefined,
        referenceOptions: undefined
      })
    ])
  )
  const keep = (value: unknown) => !(value instanceof ForeignKeyConstraint)
  const config = api.config
  return assign(new TableApi(), {
    ...api,
    name,
    alias: undefined,
    schemaName,
    columns,
    config:
      config &&
      ((): TableConfigResult => {
        const result = config()
        if (Array.isArray(result)) return result.filter(keep)
        return fromEntries(entries(result).filter(([, value]) => keep(value)))
      })
  })
}

export function renames(
  api: TableApi,
  options: PushOptions
): Array<[from: string, to: string]> {
  const prefix = `${api.schemaName ? `${api.schemaName}.` : ''}${api.name}.`
  const columns = columnData(api)
  return entries(options.rename ?? {})
    .filter(([from]) => from.startsWith(prefix))
    .map(([from, to]) => {
      if (!columns[to]) throw new Error(`Unknown column "${to}" in rename`)
      return [from.slice(prefix.length), to]
    })
}

export function renameSteps(
  api: TableApi,
  live: TableInfo,
  options: PushOptions
): Array<Sql> {
  return renames(api, options)
    .filter(([from]) => live.columns[from])
    .map(([from, to]) => {
      if (live.columns[to])
        throw new Error(`Cannot rename "${from}" to "${to}", both exist`)
      return sql`alter table ${api.identifier()} rename column ${sql.identifier(
        from
      )} to ${sql.identifier(to)}`
    })
}

const integers = [
  ['tinyint', 'smallint', 'mediumint', 'int', 'bigint'],
  ['smallint', 'integer', 'bigint']
]
const texts = ['char', 'character', 'varchar', 'character varying', 'text']

function parse(type: string) {
  const match = type.match(/^([^(]*?)\s*(?:\((.*)\))?\s*$/)!
  const args = match[2] ? match[2].split(',').map(Number) : []
  return {base: match[1], args}
}

// Whether every value of one type fits into another without loss
export function widens(from: string, to: string): boolean {
  if (from === to) return true
  const a = parse(from)
  const b = parse(to)
  if (a.base === b.base)
    return (
      b.args.length === 0 ||
      (a.args.length === b.args.length &&
        a.args.every((arg, i) => arg <= b.args[i]))
    )
  if (texts.includes(a.base) && b.base.endsWith('text') && b.args.length === 0)
    return true
  return integers.some(family => {
    const i = family.indexOf(a.base)
    return i > -1 && family.indexOf(b.base) > i
  })
}
