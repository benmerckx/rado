import type {DriverSpecs} from './Driver.ts'
import {
  type HasSql,
  type HasTable,
  type HasTarget,
  getField,
  getSql,
  getTable,
  hasField,
  internalSql
} from './Internal.ts'
import type {JoinOperator} from './Join.ts'
import {type Sql, sql} from './Sql.ts'
import type {Table, TableRow} from './Table.ts'
import type {Expand} from './Types.ts'
import {virtual} from './Virtual.ts'
import type {Include} from './expr/Include.ts'

declare const nullable: unique symbol
export interface SelectionRecord extends Record<string, SelectionInput> {}
export type IsNullable = {[nullable]: true}
export type MakeNullable<T> = Expand<{[K in keyof T]: T[K] & IsNullable}>
export type SelectionInput =
  | HasSql
  | HasTable
  | SelectionRecord
  | Include<unknown>
export type RowOfRecord<Input> = Expand<{
  [Key in keyof Input as Key extends string ? Key : never]: SelectionRow<
    Input[Key]
  >
}>
export type SelectionRow<Input> = Input extends HasSql<infer Value>
  ? Value
  : Input extends IsNullable
    ? RowOfRecord<Input> | null
    : Input extends SelectionRecord
      ? RowOfRecord<Input>
      : Input extends Table<infer Definition>
        ? TableRow<Definition>
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

export class Selection implements HasSql {
  mapRow: (ctx: MapRowContext) => unknown

  constructor(
    public input: SelectionInput,
    public nullable: Set<string>
  ) {
    const root = this.#defineColumn(nullable, input)
    this.mapRow = root.result.bind(root)
  }

  makeVirtual<Input>(name: string): Input & HasTarget {
    return virtual<Input>(name, <Input>this.input)
  }

  #defineColumn(nullable: Set<string>, input: SelectionInput): Column {
    const expr = getSql(input as HasSql)
    if (expr) return new SqlColumn(expr, getField(<any>input)?.targetName)
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
    const expr = getSql(input as HasSql)
    if (expr) {
      let exprName = name ?? expr.alias
      if (!exprName) throw new Error('Missing field name')
      while (names.has(exprName)) exprName = `${exprName}_`
      return [exprName]
    }
    return Object.entries(input).flatMap(([name, value]) =>
      this.#fieldNames(value, names, name)
    )
  }

  #selectionToSql(
    input: SelectionInput,
    names: Set<string>,
    name?: string
  ): Sql {
    const expr = getSql(input as HasSql)
    if (expr) {
      let exprName = name ?? expr.alias
      if (exprName) {
        // The bun:sqlite driver cannot handle multiple columns by the same name
        while (names.has(exprName)) exprName = `${exprName}_`
        names.add(exprName)
        if (hasField(input)) {
          const field = getField(input)
          if (field.fieldName === exprName) return expr
        }
        return sql`${expr.forSelection()} as ${sql.identifier(exprName)}`
      }
      return expr
    }
    return sql.join(
      Object.entries(input).map(([name, value]) =>
        this.#selectionToSql(value, names, name)
      ),
      sql`, `
    )
  }

  get [internalSql](): Sql {
    return this.#selectionToSql(this.input, new Set())
  }

  join(right: HasTable, operator: JoinOperator): Selection {
    return this
  }
}

export class TableSelection extends Selection {
  constructor(public table: HasTable) {
    super(table, new Set())
  }

  join(right: HasTable, operator: JoinOperator): Selection {
    const leftTable = getTable(this.table)
    const rightTable = getTable(right)
    const nullable = new Set(this.nullable)
    if (operator === 'right' || operator === 'full')
      nullable.add(leftTable.aliased)
    if (operator === 'left' || operator === 'full')
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
      Object.fromEntries(tables.map(table => [getTable(table).aliased, table])),
      nullable
    )
  }

  join(right: HasTable, operator: JoinOperator): Selection {
    const rightTable = getTable(right)
    const nullable = new Set(this.nullable)
    if (operator === 'right' || operator === 'full')
      this.tables
        .map(table => getTable(table).aliased)
        .forEach(nullable.add, nullable)
    if (operator === 'left' || operator === 'full')
      nullable.add(rightTable.aliased)
    return new JoinSelection([...this.tables, right], nullable)
  }
}

export function selection(
  input: SelectionInput,
  nullable: Array<string> = []
): Selection {
  return new Selection(input, new Set(nullable))
}

export namespace selection {
  export function table(table: HasTable): TableSelection {
    return new TableSelection(table)
  }
}
