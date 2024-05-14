import {
  getField,
  getSql,
  hasField,
  internalSql,
  type HasSql,
  type HasTable
} from './Internal.ts'
import {sql, type Sql} from './Sql.ts'
import type {Table, TableRow} from './Table.ts'
import type {Expand} from './Types.ts'
import {virtual} from './Virtual.ts'

declare const nullable: unique symbol
export interface SelectionRecord extends Record<string, SelectionInput> {}
export type IsNullable = {[nullable]: true}
export type MakeNullable<T> = Expand<{[K in keyof T]: T[K] & IsNullable}>
export type SelectionInput = HasSql | HasTable | SelectionRecord
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

interface ResultContext {
  values: Array<unknown>
  index: number
}
interface Column {
  targetName?: string
  result(ctx: ResultContext): unknown
}
class SqlColumn implements Column {
  constructor(
    public sql: Sql,
    public targetName?: string
  ) {}

  result(ctx: ResultContext) {
    const value = ctx.values[ctx.index++]
    if (value === null) return value
    return this.sql.mapFromDriverValue?.(value) ?? value
  }
}

class ObjectColumn implements Column {
  constructor(
    public nullable: Set<string>,
    public entries: Array<[string, Column]>
  ) {}

  result(ctx: ResultContext) {
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
  #input: SelectionInput
  #root: Column

  constructor(input: SelectionInput, nullable: Set<string>) {
    this.#input = input
    this.#root = this.#defineColumn(nullable, input)
  }

  makeVirtual(name: string) {
    return virtual(name, this.#input)
  }

  #defineColumn(nullable: Set<string>, input: SelectionInput): Column {
    const expr = getSql(input as HasSql)
    if (expr) return new SqlColumn(expr, getField(input as any)?.targetName)
    return new ObjectColumn(
      nullable,
      Object.entries(input).map(([name, value]) => [
        name,
        this.#defineColumn(nullable, value)
      ])
    )
  }

  mapRow = (values: Array<unknown>) => {
    return this.#root.result({values, index: 0})
  }

  get [internalSql]() {
    return this.#selectionToSql(this.#input, new Set())
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
        return sql`${expr} as ${sql.identifier(exprName)}`
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
}

export function selection(
  input: SelectionInput,
  nullable: Set<string> = new Set()
): Selection {
  return new Selection(input, nullable)
}
