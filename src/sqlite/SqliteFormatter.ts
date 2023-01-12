import {ExprData, ExprType} from '../lib/Expr'
import {FormatContext, Formatter} from '../lib/Formatter'
import {Statement, identifier} from '../lib/Statement'
import {TargetType} from '../lib/Target'

function escapeWithin(input: string, outer: string) {
  let buf = outer
  for (const char of input) {
    if (char === outer) buf += outer + outer
    else buf += char
  }
  buf += outer
  return buf
}

export class SqliteFormatter extends Formatter {
  escapeValue(value: any): string {
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'boolean') return value ? '1' : '0'
    if (typeof value === 'number') return String(value)
    if (typeof value === 'string') return this.escapeString(value)
    return 'json(' + this.escapeString(JSON.stringify(value)) + ')'
  }

  escapeIdentifier(input: string): string {
    return escapeWithin(input, '`')
  }

  escapeString(input: string) {
    return escapeWithin(input, "'")
  }

  formatSqlAccess(on: Statement, field: string): Statement {
    const target = this.formatString(`$.${field}`)
    return on.raw('->>').concat(target)
  }

  formatJsonAccess(on: Statement, field: string): Statement {
    const target = this.formatString(`$.${field}`)
    return on.raw('->').concat(target)
  }

  formatExpr(expr: ExprData, ctx: FormatContext): Statement {
    switch (expr.type) {
      case ExprType.Call:
        if (expr.method === 'match') {
          const [from, query] = expr.params
          if (from.type !== ExprType.Row) throw new Error('not implemented')
          if (from.target.type !== TargetType.Table)
            throw new Error('not implemented')
          return identifier(from.target.table.alias || from.target.table.name)
            .raw(' match ')
            .concat(this.formatExprValue(query, ctx))
        }
      default:
        return super.formatExpr(expr, ctx)
    }
  }
}
