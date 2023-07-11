import {ExprData} from '../define/Expr.js'
import {FormatContext, Formatter} from '../lib/Formatter.js'
import {Statement} from '../lib/Statement.js'

const BACKTICK = '`'
const ESCAPE_BACKTICK = '``'
const SINGLE_QUOTE = "'"
const ESCAPE_SINGLE_QUOTE = "''"
const MATCH_BACKTICK = /`/g
const MATCH_SINGLE_QUOTE = /'/g

export class SqliteFormatter extends Formatter {
  defaultKeyword = 'NULL'
  jsonObjectFn = 'json_object'

  insertParam(index: number): string {
    return '?'
  }

  formatParamValue(paramValue: any): any {
    if (paramValue === null || paramValue === undefined) return null
    if (typeof paramValue === 'boolean') return paramValue ? 1 : 0
    if (typeof paramValue === 'number') return paramValue
    if (typeof paramValue === 'string') return paramValue
    return JSON.stringify(paramValue)
  }

  escapeValue(value: any): string {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'boolean') return value ? '1' : '0'
    if (typeof value === 'number') return String(value)
    if (typeof value === 'string') return this.escapeString(value)
    return 'json(' + this.escapeString(JSON.stringify(value)) + ')'
  }

  escapeIdentifier(input: string): string {
    return BACKTICK + input.replace(MATCH_BACKTICK, ESCAPE_BACKTICK) + BACKTICK
  }

  escapeColumn(input: string): string {
    return this.escapeString(input)
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

  formatCall(ctx: FormatContext, expr: ExprData.Call): Statement {
    const {stmt} = ctx
    switch (expr.method) {
      case 'match':
        const [from, query] = expr.params
        this.formatExprValue({...ctx, tableAsExpr: true}, from)
        stmt.raw(' MATCH ')
        this.formatExprValue(ctx, query)
        return stmt
      case 'highlight':
      case 'snippet':
        stmt.identifier(expr.method)
        for (const param of stmt.call(expr.params))
          this.formatExprValue({...ctx, tableAsExpr: true}, param)
        return stmt
      default:
        return super.formatCall(ctx, expr)
    }
  }
}
