import {Dialect} from '../core/Dialect.ts'
import {Emitter} from '../core/Emitter.ts'
import type {Runtime} from '../core/MetaData.ts'
import {NamedParam, ValueParam} from '../core/Param.ts'
import type {JsonPath} from '../core/expr/Json.ts'

const BACKTICK = '`'
const ESCAPE_BACKTICK = '``'
const MATCH_BACKTICK = /`/g
const SINGLE_QUOTE = "'"
const ESCAPE_SINGLE_QUOTE = "''"
const MATCH_SINGLE_QUOTE = /'/g

export const mysqlDialect: Dialect = new Dialect(
  'mysql',
  class extends Emitter {
    runtime: Runtime = 'mysql'
    emitValue(value: unknown) {
      this.params.push(new ValueParam(value))
      this.sql += '?'
    }
    emitPlaceholder(name: string) {
      this.params.push(new NamedParam(name))
      this.sql += '?'
    }
    emitJsonPath({target, asSql, segments}: JsonPath) {
      target.emit(this)
      this.sql += asSql ? '->>' : '->'
      this.sql += this.quoteString(
        `$${segments
          .map(p => (typeof p === 'number' ? `[${p}]` : `.${p}`))
          .join('')}`
      )
    }
    emitInline(value: unknown) {
      if (value === null || value === undefined) return (this.sql += 'null')
      if (typeof value === 'number' || typeof value === 'boolean')
        return (this.sql += value)
      if (typeof value === 'string')
        return (this.sql += this.quoteString(value))
      this.sql += this.quoteString(JSON.stringify(value))
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
  }
)
