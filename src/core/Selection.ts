import {
  getField,
  getSql,
  hasField,
  hasSql,
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

export class Selection implements HasSql {
  #input: SelectionInput
  #nullable: Set<string>

  constructor(input: SelectionInput, nullable: Set<string>) {
    this.#input = input
    this.#nullable = nullable
  }

  makeVirtual(name: string) {
    return virtual(name, this.#input)
  }

  mapRow = (values: Array<unknown>) => {
    return this.#mapResult(this.#input, values)
  }

  get [internalSql]() {
    return this.#selectionToSql(this.#input, new Set())
  }

  #mapResult(input: SelectionInput, values: Array<unknown>): unknown {
    const expr = this.#exprOf(input)
    if (expr) {
      const value = values.shift()
      if (value !== null && expr.mapFromDriverValue)
        return expr.mapFromDriverValue(value)
      return value
    }
    const result: Record<string, unknown> = {}
    let isNullable = this.#nullable.size > 0
    for (const name in input) {
      const expr = input[name as keyof typeof input]
      const value = this.#mapResult(expr, values)
      result[name] = value
      if (isNullable) {
        if (value === null) {
          const field = getField(expr)
          if (field && !this.#nullable.has(field.targetName)) isNullable = false
        } else {
          isNullable = false
        }
      }
    }
    if (isNullable) return null
    return result
  }

  #selectionToSql(
    input: SelectionInput,
    names: Set<string>,
    name?: string
  ): Sql {
    const expr = this.#exprOf(input)
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

  #exprOf(input: SelectionInput) {
    return hasSql(input) ? getSql(input) : undefined
  }
}

export function selection(
  input: SelectionInput,
  nullable: Set<string> = new Set()
): Selection {
  return new Selection(input, nullable)
}
