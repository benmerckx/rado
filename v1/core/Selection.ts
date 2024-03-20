import type {Expr} from './Expr.ts'
import {
  getExpr,
  hasExpr,
  hasTable,
  type HasExpr,
  type HasTable
} from './Internal.ts'
import {isSql, sql, type Sql} from './Sql.ts'
import type {Table, TableRow} from './Table.ts'

type SelectionBase = HasExpr | HasTable | Sql
interface SelectionRecord extends Record<string, SelectionInput> {}
export type SelectionInput = SelectionBase | SelectionRecord

export type SelectionRow<Input extends SelectionInput> = Input extends Expr<
  infer Value
>
  ? Value
  : Input extends Sql<infer Value>
  ? Value
  : Input extends Table<infer Definition>
  ? TableRow<Definition>
  : Input extends SelectionRecord
  ? {[Key in keyof Input]: SelectionRow<Input[Key]>}
  : never

function selectionToSql(input: SelectionInput): Sql {
  if (isSql(input)) return input
  if (hasExpr(input)) return getExpr(input)
  if (hasTable(input)) throw new Error('todo')
  const entries = Object.entries(input)
  return sql.join(
    entries.map(([name, value]): Sql => {
      const sqlValue = selectionToSql(value)
      return sql`${sqlValue} as ${sql.identifier(name)}`
    }),
    sql`, `
  )
}

export class Selection {
  constructor(public input: SelectionInput) {}

  toSql(): Sql {
    return selectionToSql(this.input)
  }
}
