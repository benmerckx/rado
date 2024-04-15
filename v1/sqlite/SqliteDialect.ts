import {dialect} from '../core/Dialect.ts'
import {Emitter} from '../core/Emitter.ts'
import {NamedParam, ValueParam} from '../core/Param.ts'

const DOUBLE_QUOTE = '"'
const ESCAPE_DOUBLE_QUOTE = '""'
const MATCH_DOUBLE_QUOTE = /"/g
const SINGLE_QUOTE = "'"
const ESCAPE_SINGLE_QUOTE = "''"
const MATCH_SINGLE_QUOTE = /'/g

class SqliteEmitter extends Emitter {
  emitValue(value: unknown) {
    this.sql += '?'
    this.params.push(new ValueParam(value))
  }
  emitJsonPath(path: Array<number | string>) {
    this.sql += `->${this.quoteString(`$.${path.join('.')}`)}`
  }
  emitInline(value: unknown) {
    if (value === null || value === undefined) return (this.sql += 'null')
    if (typeof value === 'number') return (this.sql += value)
    if (typeof value === 'string') return (this.sql += this.quoteString(value))
    if (typeof value === 'boolean') return (this.sql += value ? '1' : '0')
    this.sql += `json(${this.quoteString(JSON.stringify(value))})`
  }
  emitPlaceholder(name: string) {
    this.sql += '?'
    this.params.push(new NamedParam(name))
  }
  emitIdentifier(identifier: string) {
    this.sql +=
      DOUBLE_QUOTE +
      identifier.replace(MATCH_DOUBLE_QUOTE, ESCAPE_DOUBLE_QUOTE) +
      DOUBLE_QUOTE
  }
  emitDefaultValue() {
    this.sql += 'null'
  }
  quoteString(input: string): string {
    return (
      SINGLE_QUOTE +
      input.replace(MATCH_SINGLE_QUOTE, ESCAPE_SINGLE_QUOTE) +
      SINGLE_QUOTE
    )
  }
  emitIdColumn() {
    this.sql += 'integer primary key autoincrement'
  }
}

export const sqliteDialect = dialect(SqliteEmitter)
