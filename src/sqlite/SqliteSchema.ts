import {ColumnData, ColumnType} from '../Column'
import {Statement} from '../Statement'

export namespace SqliteSchema {
  export type Column = {
    cid: number
    name: string
    type: string
    notnull: number
    dflt_value: string | null
    pk: number
  }

  export function tableData(tableName: string) {
    return Statement.tag`select * from pragma_table_info(${tableName}) order by cid`
  }

  export function parseType(type: string): ColumnType {
    const key = type.toLowerCase()
    const sizePos = key.indexOf('(')
    const base = key.slice(0, sizePos > 0 ? sizePos : undefined)
    if (base === 'boolean') return ColumnType.Boolean
    if (base === 'json') return ColumnType.Json
    if (intTypes.has(base)) return ColumnType.Integer
    if (textTypes.has(base)) return ColumnType.String
    if (floatTypes.has(base)) return ColumnType.Number
    if (numericTypes.has(base)) return ColumnType.Number
    throw new Error(`Unknown type: ${type}`)
  }

  export function parseColumn({
    name,
    type,
    notnull,
    pk,
    dflt_value
  }: Column): [string, ColumnData] {
    const def: ColumnData = {type: parseType(type), name}
    if (notnull === 0) def.nullable = true
    if (pk === 1) def.primaryKey = true
    if (dflt_value !== null)
      def.defaultValue = parseDefaultValue(def.type, dflt_value)
    return [name, def]
  }

  export function parseDefaultValue(expectedType: ColumnType, value: string) {
    const v =
      value.startsWith("'") && value.endsWith("'")
        ? parseSqlString(value)
        : value
    switch (expectedType) {
      case ColumnType.Boolean:
        return v === 'true' || v === '1'
      case ColumnType.Integer:
        return Number(v)
      case ColumnType.Number:
        return Number(v)
      case ColumnType.String:
        return v
      case ColumnType.Json:
        return JSON.parse(v)
    }
  }

  export function parseSqlString(value: string) {
    return value.slice(1, -1).replaceAll("''", "'")
  }
}

const intTypes = new Set([
  'int',
  'integer',
  'tinyint',
  'smallint',
  'mediumint',
  'bigint',
  'unsigned big int',
  'int2',
  'int8'
])
const textTypes = new Set([
  'character',
  'varchar',
  'varying character',
  'nchar',
  'native character',
  'nvarchar',
  'text',
  'clob',
  'string'
])
const floatTypes = new Set(['real', 'double', 'double precision', 'float'])
const numericTypes = new Set([
  'numeric',
  'decimal',
  'boolean',
  'date',
  'datetime'
])
