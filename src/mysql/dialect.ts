import {Dialect} from '../core/Dialect.ts'
import {Emitter, hex} from '../core/Emitter.ts'
import type {JsonPath} from '../core/expr/Json.ts'
import type {Runtime} from '../core/MetaData.ts'
import {NamedParam, type ParamMapper, ValueParam} from '../core/Param.ts'

const BACKTICK = '`'
const ESCAPE_BACKTICK = '``'
const MATCH_BACKTICK = /`/g
const ESCAPE_BACKSLASH = '\\\\'
const MATCH_BACKSLASH = /\\/g
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
    emitPlaceholder(name: string, map?: ParamMapper) {
      this.params.push(new NamedParam(name, map))
      this.sql += '?'
    }
    emitJsonPath({target, asSql, segments}: JsonPath) {
      target.emit(this)
      this.sql += asSql ? '->>' : '->'
      this.sql += this.quoteString(
        `$${segments
          .map(p =>
            typeof p === 'number' ? `[${p}]` : `.${JSON.stringify(p)}`
          )
          .join('')}`
      )
    }
    emitInline(value: unknown) {
      if (value === null || value === undefined) return (this.sql += 'null')
      if (typeof value === 'number' || typeof value === 'boolean')
        return (this.sql += value)
      if (typeof value === 'string')
        return (this.sql += this.quoteString(value))
      if (typeof value === 'bigint') return (this.sql += String(value))
      if (value instanceof ArrayBuffer) value = new Uint8Array(value)
      if (value instanceof Uint8Array) return (this.sql += `x'${hex(value)}'`)
      // As datetime columns write them, MySQL takes an ISO default in a
      // create table but refuses it when an insert uses it
      if (value instanceof Date)
        return (this.sql += this.quoteString(
          value.toISOString().slice(0, -1).replace('T', ' ')
        ))
      this.sql += this.quoteString(JSON.stringify(value))
    }
    quoteString(input: string): string {
      return (
        SINGLE_QUOTE +
        input
          .replace(MATCH_BACKSLASH, ESCAPE_BACKSLASH)
          .replace(MATCH_SINGLE_QUOTE, ESCAPE_SINGLE_QUOTE) +
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
