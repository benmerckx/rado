import {ColumnData} from '../define/Column.js'
import {FormatContext, Formatter} from '../lib/Formatter.js'
import {Statement} from '../lib/Statement.js'
import {PostgresColumn} from './PostgresColumn.js'

export class PostgresFormatter extends Formatter {
  defaultKeyword = 'DEFAULT'
  jsonObjectFn = 'json_build_object'

  insertParam(index: number): string {
    return `$${index + 1}`
  }

  formatParamValue(paramValue: any): any {
    if (paramValue === null || paramValue === undefined) return null
    if (typeof paramValue === 'boolean') return paramValue
    if (typeof paramValue === 'number') return paramValue
    if (typeof paramValue === 'string') return paramValue
    return JSON.stringify(paramValue)
  }

  escapeValue(value: any): string {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
    if (typeof value === 'number') return String(value)
    if (typeof value === 'string') return this.escapeString(value)
    return 'json(' + this.escapeString(JSON.stringify(value)) + ')'
  }

  // https://github.com/brianc/node-postgres/blob/970804b6c110fab500da9db71d68d04e0ecea406/packages/pg/lib/utils.js#L165
  escapeIdentifier(input: string): string {
    return '"' + input.replace(/"/g, '""') + '"'
  }

  escapeColumn(input: string): string {
    return this.escapeIdentifier(input)
  }

  // https://github.com/brianc/node-postgres/blob/970804b6c110fab500da9db71d68d04e0ecea406/packages/pg/lib/utils.js#L170
  escapeString(input: string) {
    let hasBackslash = false
    let escaped = "'"

    for (let i = 0; i < input.length; i++) {
      let c = input[i]
      if (c === "'") {
        escaped += c + c
      } else if (c === '\\') {
        escaped += c + c
        hasBackslash = true
      } else {
        escaped += c
      }
    }

    escaped += "'"

    if (hasBackslash === true) {
      escaped = ' E' + escaped
    }

    return escaped
  }

  formatAccess(
    ctx: FormatContext,
    mkSubject: () => void,
    field: string
  ): Statement {
    const {stmt, formatAsJson} = ctx
    mkSubject()
    stmt.raw(formatAsJson ? '->' : '->>')
    return this.formatString(ctx, `$.${field}`)
  }

  formatType(ctx: FormatContext, column: ColumnData): Statement {
    const {stmt} = ctx
    const type = column[PostgresColumn.Column]
    if (type) return stmt.raw(type)
    return super.formatType(ctx, column)
  }
}
