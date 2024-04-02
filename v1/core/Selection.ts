import type {Expr} from './Expr.ts'
import {
  type HasSql,
  type HasTable,
  getField,
  getSql,
  hasField,
  hasSql,
  internalSql
} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'
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

const exprOf = (input: SelectionInput) =>
  hasSql(input) ? getSql(input) : undefined

function selectionToSql(input: SelectionInput, name?: string): Sql {
  const expr = exprOf(input)
  if (expr) {
    const named = expr.alias ?? name
    if (named) return sql`${expr} as ${sql.identifier(named)}`
    return expr
  }
  const entries = Object.entries(input)
  return sql.join(
    entries.map(([name, value]): Sql => {
      if (hasField(value)) return sql.field(getField(value))
      return selectionToSql(value, name)
    }),
    sql`, `
  )
}

function mapResult(input: SelectionInput, values: Array<unknown>): unknown {
  const expr = exprOf(input)
  if (expr) {
    const value = values.shift()
    if (expr.mapFromDriverValue) return expr.mapFromDriverValue(value)
    return value
  }
  return Object.fromEntries(
    Object.entries(input).map(([name, value]) => [
      name,
      mapResult(value, values)
    ])
  )
}

export class Selection implements HasSql {
  #input: SelectionInput

  constructor(input: SelectionInput) {
    this.#input = input
  }

  mapRow = (values: Array<unknown>) => {
    return mapResult(this.#input, values)
  }

  get [internalSql]() {
    return selectionToSql(this.#input)
  }
}

export function selection(input: SelectionInput): Selection {
  return new Selection(input)
}
