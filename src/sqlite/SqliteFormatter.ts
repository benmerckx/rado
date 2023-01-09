import {Formatter} from '../Formatter'
import {Statement} from '../Statement'

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
}
