import {HasExpr, HasTable, getExpr, hasExpr, hasTable} from './Meta.ts'
import {Sql, sql} from './Sql.ts'

type SelectionBase = HasExpr | HasTable
interface SelectionRecord extends Record<string, SelectionInput> {}
export type SelectionInput = SelectionBase | SelectionRecord

interface SqlOptions {
  includeTableName: boolean
}

function selectionToSql(input: SelectionInput, options: SqlOptions): Sql {
  if (hasExpr(input)) return getExpr(input)(options)
  if (hasTable(input)) throw new Error('todo')
  const entries = Object.entries(input)
  return sql.join(
    entries.map(([name, value]): Sql => {
      const sqlValue = selectionToSql(value, options)
      return sql`${sqlValue} as ${sql.identifier(name)}`
    }),
    sql`, `
  )
}

export class Selection {
  constructor(public input: SelectionInput) {}

  toSql(options: SqlOptions): Sql {
    return selectionToSql(this.input, options)
  }
}
