import {dialect} from '../core/Dialect.ts'
import {
  Emitter,
  emitDefaultValue,
  emitIdentifier,
  emitInline,
  emitJsonPath,
  emitPlaceholder,
  emitValue
} from '../core/Emitter.ts'

const DOUBLE_QUOTE = '"'
const ESCAPE_DOUBLE_QUOTE = '""'
const MATCH_DOUBLE_QUOTE = /"/g
const SINGLE_QUOTE = "'"
const ESCAPE_SINGLE_QUOTE = "''"
const MATCH_SINGLE_QUOTE = /'/g

class PostgresEmitter extends Emitter {
  paramIndex = 0;
  [emitValue](value: unknown) {
    this.sql += `$${++this.paramIndex}`
    this.params.push(value)
  }
  [emitJsonPath](path: Array<number | string>) {
    for (let i = 0; i < path.length; i++) {
      const access = path[i]
      if (typeof access === 'number') this.sql += access
      else this.sql += this.quoteString(access)
      if (i < path.length - 2) this.sql += '->>'
      else if (i < path.length - 1) this.sql += '->'
    }
  }
  [emitInline](value: unknown) {
    if (value === null || value === undefined) return (this.sql += 'null')
    if (typeof value === 'number' || typeof value === 'boolean')
      return (this.sql += value)
    if (typeof value === 'string') return (this.sql += this.quoteString(value))
    this.sql += `json(${this.quoteString(JSON.stringify(value))})`
  }
  [emitPlaceholder](name: string) {
    throw new Error('todo')
  }
  quoteString(input: string): string {
    return (
      SINGLE_QUOTE +
      input.replace(MATCH_SINGLE_QUOTE, ESCAPE_SINGLE_QUOTE) +
      SINGLE_QUOTE
    )
  }
  [emitIdentifier](identifier: string) {
    this.sql +=
      DOUBLE_QUOTE +
      identifier.replace(MATCH_DOUBLE_QUOTE, ESCAPE_DOUBLE_QUOTE) +
      DOUBLE_QUOTE
  }
  [emitDefaultValue]() {
    this.sql += 'default'
  }
}

export const postgresDialect = dialect(PostgresEmitter)
