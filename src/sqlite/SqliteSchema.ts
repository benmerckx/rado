import {Cursor} from '../lib/Cursor'
import {Expr} from '../lib/Expr'
import {SchemaInstructions} from '../lib/Schema'
import {identifier, raw} from '../lib/Statement'
import {SqliteFormatter} from './SqliteFormatter'

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
  ): Cursor<Array<SqliteSchema.Column>> {
    return Cursor.all`select * from pragma_table_info(${tableName}) order by cid`
  }

  export function indexData(
    tableName: Expr<string>
  ): Cursor<Array<SqliteSchema.Index>> {
    return Cursor.all`select * from sqlite_master where type='index' and tbl_name=${tableName}`
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
    return [
      column.name,
      identifier(column.name)
        .add(column.type.toLowerCase())
        .addIf(column.pk === 1, 'primary key')
        .addIf(column.notnull === 1, 'not null')
        .addIf(
          column.dflt_value !== null,
          raw('default').add(column.dflt_value!)
        )
        .compile(formatter).sql
    ]
  }

  export function indexInstruction(index: Index): [string, string] {
    return [index.name, index.sql]
  }
}
