import type {Expr} from './Expr.ts'
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

export type SelectionBase = HasSql | HasTable | Sql
export interface SelectionRecord extends Record<string, SelectionInput> {}
export type SelectionInput = SelectionBase | SelectionRecord

export type SelectionRow<Input> = Input extends Expr<infer Value>
  ? Value
  : Input extends Sql<infer Value>
  ? Value
  : Input extends Table<infer Definition>
  ? TableRow<Definition>
  : Input extends SelectionRecord
  ? {[Key in keyof Input]: SelectionRow<Input[Key]>}
  : never

export class Selection implements HasSql {
  #input: SelectionInput
  #nullable: Set<string>

  constructor(input: SelectionInput, nullable: Set<string>) {
    this.#input = input
    this.#nullable = nullable
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
      if (expr.mapFromDriverValue) return expr.mapFromDriverValue(value)
      return value
    }
    const result: Record<string, unknown> = {}
    let isNullable = this.#nullable.size > 0
    for (const [name, expr] of Object.entries(input)) {
      const value = this.#mapResult(expr, values)
      result[name] = value
      if (isNullable) {
        if (value === null) {
          const field = getField(expr)
          if (field && !this.#nullable.has(field.tableName)) isNullable = false
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
      let exprName = expr.alias ?? name
      if (exprName) {
        // Some drivers have problems with multiple columns with the same name
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
