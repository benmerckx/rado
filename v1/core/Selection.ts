import type {Expr} from './Expr.ts'
import {
  getExpr,
  getField,
  hasExpr,
  hasField,
  type HasExpr,
  type HasTable
} from './Internal.ts'
import {isSql, sql, type Sql} from './Sql.ts'
import type {Table, TableRow} from './Table.ts'

export type SelectionBase = HasExpr | HasTable | Sql
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

function getSql(input: SelectionInput): Sql | undefined {
  if (isSql(input)) return input
  if (hasExpr(input)) return getExpr(input)
  return undefined
}

function selectionToSql(input: SelectionInput, name?: string): Sql {
  const single = getSql(input)
  if (single) {
    if (!name) {
      if (single.alias) return sql`${single} as ${sql.identifier(single.alias)}`
      return single
    }
    return sql`${single} as ${sql.identifier(name)}`
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
  const single = getSql(input)
  if (single) {
    const value = values.shift()
    if (single.mapFromDriverValue) return single.mapFromDriverValue(value)
    return value
  }
  const result = Object.create(null)
  for (const [name, value] of Object.entries(input)) {
    result[name] = mapResult(value, values)
  }
  return result
}

export class Selection {
  constructor(public input: SelectionInput) {}

  mapRow = (values: Array<unknown>) => {
    return mapResult(this.input, values)
  }

  toSql(): Sql {
    return selectionToSql(this.input)
  }
}
