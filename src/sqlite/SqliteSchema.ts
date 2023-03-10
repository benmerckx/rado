import {Expr} from '../define/Expr.js'
import {Query} from '../define/Query.js'
import {SchemaInstructions} from '../define/Schema.js'
import {sql} from '../define/Sql.js'
import {Statement} from '../lib/Statement.js'
import {SqliteFormatter} from './SqliteFormatter.js'

export namespace SqliteSchema {
  const formatter = new SqliteFormatter()

  export type Column = {
    cid: number
    name: string
    type: string
    notnull: number
    dflt_value: string | null
    pk: number
  }

  export interface Index {
    type: 'index'
    name: string
    tbl_name: string
    rootpage: number
    sql: string
  }

  export function tableData(
    tableName: Expr<string>
  ): Query<Array<SqliteSchema.Column>> {
    return sql.all`select * from pragma_table_info(${tableName}) order by cid`
  }

  export function indexData(
    tableName: Expr<string>
  ): Query<Array<SqliteSchema.Index>> {
    return sql.all`select * from sqlite_master where type='index' and tbl_name=${tableName}`
  }

  export function createInstructions(
    columnData: Array<Column>,
    indexData: Array<Index>
  ): SchemaInstructions | undefined {
    if (columnData.length === 0 && indexData.length === 0) return undefined
    const columns = columnData.map(columnInstruction)
    const indexes = indexData.map(indexInstruction).filter(row => row[1])
    return {
      columns: Object.fromEntries(columns),
      indexes: Object.fromEntries(indexes)
    }
  }

  export function columnInstruction(column: Column): [string, string] {
    const stmt = new Statement(formatter)
    stmt.identifier(column.name).add(column.type)
    if (column.pk === 1) stmt.add('PRIMARY KEY')
    if (column.notnull === 1) stmt.add('NOT NULL')
    if (column.dflt_value !== null) {
      stmt
        .add('DEFAULT')
        .space()
        .openParenthesis()
        .raw(column.dflt_value)
        .closeParenthesis()
    }
    return [column.name, stmt.sql]
  }

  export function indexInstruction(index: Index): [string, string] {
    return [index.name, index.sql]
  }
}
