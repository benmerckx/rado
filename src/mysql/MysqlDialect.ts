import {Dialect} from '../core/Dialect.ts'
import {Emitter} from '../core/Emitter.ts'
import {NamedParam, ValueParam} from '../core/Param.ts'

const BACKTICK = '`'
const ESCAPE_BACKTICK = '``'
const MATCH_BACKTICK = /`/g
const SINGLE_QUOTE = "'"
const ESCAPE_SINGLE_QUOTE = "''"
const MATCH_SINGLE_QUOTE = /'/g

export const mysqlDialect = new Dialect(
  class extends Emitter {
    paramIndex = 0
    emitValue(value: unknown) {
      this.sql += '?'
      this.params.push(new ValueParam(value))
    }
    emitJsonPath(path: Array<number | string>) {
      this.sql += `->>${this.quoteString(
        `$${path
          .map(p => (typeof p === 'number' ? `[${p}]` : `.${p}`))
          .join('')}`
      )}`
    }
    emitInline(value: unknown) {
      if (value === null || value === undefined) return (this.sql += 'null')
      if (typeof value === 'number' || typeof value === 'boolean')
        return (this.sql += value)
      if (typeof value === 'string')
        return (this.sql += this.quoteString(value))
      this.sql += this.quoteString(JSON.stringify(value))
    }
    emitPlaceholder(name: string) {
      this.sql += '?'
      this.params.push(new NamedParam(name))
    }
    quoteString(input: string): string {
      return (
        SINGLE_QUOTE +
        input.replace(MATCH_SINGLE_QUOTE, ESCAPE_SINGLE_QUOTE) +
        SINGLE_QUOTE
      )
    }
    emitIdentifier(identifier: string) {
      this.sql +=
        BACKTICK +
        identifier.replace(MATCH_BACKTICK, ESCAPE_BACKTICK) +
        BACKTICK
    }
    emitDefaultValue() {
      this.sql += 'default'
    }
    emitIdColumn() {
      this.sql += 'int not null auto_increment'
    }
    emitLastInsertId() {
      this.sql += 'last_insert_id()'
    }
  }
)
