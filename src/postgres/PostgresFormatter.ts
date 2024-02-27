import {ColumnType} from '../index.js'
import {FormatContext, Formatter} from '../lib/Formatter.js'
import {Statement} from '../lib/Statement.js'

const DOUBLE_QUOTE = `"`
const ESCAPE_DOUBLE_QUOTE = `\"`
const MATCH_DOUBLE_QUOTE = /"/g
const SINGLE_QUOTE = "'"
const ESCAPE_SINGLE_QUOTE = `\'`
const MATCH_SINGLE_QUOTE = /'/g

export class PostgresFormatter extends Formatter {
  jsonObjectFn = 'json_build_object'

  formatDefaultValue(ctx: FormatContext) {
    return ctx.stmt.raw('DEFAULT')
  }

  formatParamValue(paramValue: any): any {
    if (paramValue === null || paramValue === undefined) return null
    if (typeof paramValue === 'boolean') return paramValue ? 'TRUE' : 'FALSE'
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

  escapeIdentifier(input: string): string {
    return (
      DOUBLE_QUOTE +
      input.replace(MATCH_DOUBLE_QUOTE, ESCAPE_DOUBLE_QUOTE) +
      DOUBLE_QUOTE
    )
  }

  escapeString(input: string) {
    return (
      SINGLE_QUOTE +
      input.replace(MATCH_SINGLE_QUOTE, ESCAPE_SINGLE_QUOTE) +
      SINGLE_QUOTE
    )
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

  formatType(ctx: FormatContext, type: ColumnType): Statement {
    const {stmt} = ctx
    switch (type) {
      case ColumnType.Serial:
        return stmt.raw('INT GENERATED ALWAYS AS IDENTITY')
      default:
        return super.formatType(ctx, type)
    }
  }
}
