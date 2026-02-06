import type {DriverSpecs} from './Driver.ts'
import {
  HasInternal,
  type HasTable,
  type HasTarget,
  type HasValue,
  get
} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'
import type {Table, TableRow} from './Table.ts'
import type {Expand} from './Types.ts'
import {type VirtualTarget, virtualTarget} from './Virtual.ts'
import type {Include} from './expr/Include.ts'
import type {JoinOp} from './query/Query.ts'

declare const nullable: unique symbol
export interface SelectionRecord extends Record<string, SelectionInput> {}
export type IsNullable = {[nullable]: true}
export type MakeNullable<T> = Expand<{[K in keyof T]: T[K] & IsNullable}>
export type SelectionInput =
  | HasValue
  | HasTable
  | HasTarget
  | SelectionRecord
  | Include<unknown>
export type RowOfRecord<Input> = Expand<{
  [Key in keyof Input as Key extends string ? Key : never]: SelectionRow<
    Input[Key]
  >
}>
export type SelectionRow<Input> = Input extends HasValue<infer Value>
  ? Value
  : Input extends IsNullable
    ? RowOfRecord<Input> | null
    : Input extends Table<infer Definition>
      ? TableRow<Definition>
      : Input extends object
        ? RowOfRecord<Input>
        : never

export interface MapRowContext {
  values: Array<unknown>
  index: number
  specs: DriverSpecs
}
interface Column {
  targetName?: string
  result(ctx: MapRowContext): unknown
}

function plainEntries(
  input: unknown
): Array<[string, SelectionInput]> {
  if (!input || typeof input !== 'object') return []
  if (Object.getPrototypeOf(input) !== Object.prototype) return []
  return Object.entries(input) as Array<[string, SelectionInput]>
}
class SqlColumn implements Column {
  constructor(
    public sql: Sql,
    public targetName?: string
  ) {}

  result(ctx: MapRowContext) {
    const value = ctx.values[ctx.index++]
    if (!this.sql.mapFromDriverValue) return value
    return this.sql.mapFromDriverValue(value, ctx.specs)
  }
}

class ObjectColumn implements Column {
  constructor(
    public nullable: Set<string>,
    public entries: Array<[string, Column]>
  ) {}

  result(ctx: MapRowContext) {
    const result: Record<string, unknown> = {}
    let isNullable = this.nullable.size > 0
    for (const entry of this.entries) {
      const name = entry[0]
      const col = entry[1]
      const value = col.result(ctx)
      result[name] = value
      if (isNullable) {
        if (value === null) {
          if (col.targetName && !this.nullable.has(col.targetName))
            isNullable = false
        } else {
          isNullable = false
        }
      }
    }
    if (isNullable) return null
    return result
  }
}

export class Selection extends HasInternal<{value: Sql}> {
  mapRow: (ctx: MapRowContext) => unknown

  constructor(
    public input: SelectionInput,
    public nullable: Set<string> = new Set()
  ) {
    super({
      get value() {
        return sql.join(selectionToSql(input, new Set()), sql`, `)
      }
    })
    const root = this.#defineColumn(nullable, input)
    this.mapRow = root.result.bind(root)
  }

  makeVirtual<Input>(name: string): VirtualTarget<Input> {
    return virtualTarget(name, <Input>this.input)
  }

  #defineColumn(nullable: Set<string>, input: SelectionInput): Column {
    const entries = plainEntries(input)
    if (entries.length > 0) {
      return new ObjectColumn(
        nullable,
        entries.flatMap(([name, value]) =>
          value === undefined ? [] : [[name, this.#defineColumn(nullable, value)]]
        )
      )
    }
    const {value, field} = get(input)
    if (value) return new SqlColumn(value, field?.targetName)
    return new ObjectColumn(nullable, [])
  }

  fieldNames(): Array<string> {
    return this.#fieldNames(this.input, new Set())
  }

  #fieldNames(
    input: SelectionInput,
    names: Set<string>,
    name?: string
  ): Array<string> {
    const entries = plainEntries(input)
    if (entries.length > 0)
      return entries.flatMap(([name, value]) =>
        value === undefined ? [] : this.#fieldNames(value, names, name)
      )
    const {value} = get(input)
    if (value) {
      let exprName = name ?? value.alias
      if (!exprName) throw new Error('Missing field name')
      while (names.has(exprName)) exprName = `${exprName}_`
      return [exprName]
    }
    return []
  }

  join(right: HasTarget | Sql, operator: JoinOp): Selection {
    return this
  }
}

function selectionToSql(
  input: SelectionInput,
  names: Set<string>,
  name?: string
): Array<Sql> {
  const entries = plainEntries(input)
  if (entries.length > 0) {
    return entries.flatMap(([name, value]) =>
      value === undefined ? [] : selectionToSql(value, names, name)
    )
  }
  const {field, value} = get(input)
  if (value) {
    let exprName = name ?? value.alias
    if (exprName) {
      // The bun:sqlite driver cannot handle multiple columns by the same name
      while (names.has(exprName)) exprName = `${exprName}_`
      names.add(exprName)
      if (field) {
        if (field.fieldName === exprName) return [value]
      }
      return [sql`${value.forSelection()} as ${sql.identifier(exprName)}`]
    }
    return [value]
  }
  return []
}

export class TableSelection extends Selection {
  constructor(public table: HasTable) {
    super(get(table).selection?.input ?? table, new Set())
  }

  join(right: HasTarget | Sql, operator: JoinOp): Selection {
    const {table: leftTable} = get(this.table)
    if (!hasTableInput(right)) return this
    const {table: rightTable} = get(right)
    const nullable = new Set(this.nullable)
    if (operator === 'rightJoin' || operator === 'fullJoin')
      nullable.add(leftTable.aliased)
    if (operator === 'leftJoin' || operator === 'fullJoin')
      nullable.add(rightTable.aliased)
    return new JoinSelection([this.table, right], nullable)
  }
}

export class JoinSelection extends Selection {
  constructor(
    public tables: Array<HasTable>,
    nullable: Set<string>
  ) {
    super(
      Object.fromEntries(
        tables.map(table => [
          get(table).table!.aliased,
          get(table).selection?.input ?? table
        ])
      ),
      nullable
    )
  }

  join(right: HasTarget | Sql, operator: JoinOp): Selection {
    if (!hasTableInput(right)) return this
    const {table: rightTable} = get(right)
    const nullable = new Set(this.nullable)
    if (operator === 'rightJoin' || operator === 'fullJoin')
      this.tables
        .map(table => get(table).table!.aliased)
        .forEach(nullable.add, nullable)
    if (operator === 'leftJoin' || operator === 'fullJoin')
      nullable.add(rightTable.aliased)
    return new JoinSelection([...this.tables, right], nullable)
  }
}

const selected = new WeakMap<SelectionInput, Selection>()

function hasTableInput(input: SelectionInput | HasTarget | Sql): input is HasTable {
  const {table} = get(input)
  if (!table || !input || typeof input !== 'object') return false
  return Object.values(input as Record<string, unknown>).every(value => {
    const {field} = get(value as object)
    return Boolean(field && field.targetName === table.aliased)
  })
}

export function selection(input: SelectionInput): Selection {
  if (input instanceof Selection) return input
  if (selected.has(input)) return selected.get(input)!
  const selection = hasTableInput(input) ? new TableSelection(input) : new Selection(input)
  selected.set(input, selection)
  return selection
}
