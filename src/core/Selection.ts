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
    const {value, field} = get(input)
    if (value) return new SqlColumn(value, field?.targetName)
    return new ObjectColumn(
      nullable,
      Object.entries(input).map(([name, value]) => [
        name,
        this.#defineColumn(nullable, value)
      ])
    )
  }

  fieldNames(): Array<string> {
    return this.#fieldNames(this.input, new Set())
  }

  #fieldNames(
    input: SelectionInput,
    names: Set<string>,
    name?: string
  ): Array<string> {
    const {value} = get(input)
    if (value) {
      let exprName = name ?? value.alias
      if (!exprName) throw new Error('Missing field name')
      while (names.has(exprName)) exprName = `${exprName}_`
      return [exprName]
    }
    return Object.entries(input).flatMap(([name, value]) =>
      this.#fieldNames(value, names, name)
    )
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
  return Object.entries(input).flatMap(([name, value]) =>
    selectionToSql(value, names, name)
  )
}

export class TableSelection extends Selection {
  constructor(public table: HasTable) {
    super(table, new Set())
  }

  join(right: HasTarget | Sql, operator: JoinOp): Selection {
    const {table: leftTable} = get(this.table)
    const {table: rightTable} = get(right)
    if (!rightTable) return this
    const nullable = new Set(this.nullable)
    if (operator === 'rightJoin' || operator === 'fullJoin')
      nullable.add(leftTable.aliased)
    if (operator === 'leftJoin' || operator === 'fullJoin')
      nullable.add(rightTable.aliased)
    return new JoinSelection([this.table, right as HasTable], nullable)
  }
}

export class JoinSelection extends Selection {
  constructor(
    public tables: Array<HasTable>,
    nullable: Set<string>
  ) {
    super(
      Object.fromEntries(
        tables.map(table => [get(table).table.aliased, table])
      ),
      nullable
    )
  }

  join(right: HasTarget | Sql, operator: JoinOp): Selection {
    const {table: rightTable} = get(right)
    if (!rightTable) return this
    const nullable = new Set(this.nullable)
    if (operator === 'rightJoin' || operator === 'fullJoin')
      this.tables
        .map(table => get(table).table.aliased)
        .forEach(nullable.add, nullable)
    if (operator === 'leftJoin' || operator === 'fullJoin')
      nullable.add(rightTable.aliased)
    return new JoinSelection([...this.tables, right as HasTable], nullable)
  }
}

const selected = new WeakMap<SelectionInput, Selection>()

export function selection(input: SelectionInput): Selection {
  if (input instanceof Selection) return input
  if (selected.has(input)) return selected.get(input)!
  const {table} = get(input)
  const selection = table
    ? new TableSelection(input as HasTable)
    : new Selection(input)
  selected.set(input, selection)
  return selection
}
