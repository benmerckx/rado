import {Dialect} from '../core/Dialect.ts'
import {Emitter} from '../core/Emitter.ts'
import {NamedParam, ValueParam} from '../core/Param.ts'

const DOUBLE_QUOTE = '"'
const ESCAPE_DOUBLE_QUOTE = '""'
const MATCH_DOUBLE_QUOTE = /"/g
const SINGLE_QUOTE = "'"
const ESCAPE_SINGLE_QUOTE = "''"
const MATCH_SINGLE_QUOTE = /'/g

export const postgresDialect = new Dialect(
  class extends Emitter {
    paramIndex = 0
    jsonArrayFn = 'json_build_array'
    jsonGroupFn = 'json_agg'
    emitValue(value: unknown) {
      this.sql += `$${++this.paramIndex}`
      this.params.push(new ValueParam(value))
    }
    emitJsonPath(path: Array<number | string>) {
      for (let i = 0; i < path.length; i++) {
        const access = path[i]
        if (i <= path.length - 2) this.sql += '->'
        else if (i === path.length - 1) this.sql += '->>'
        if (typeof access === 'number') this.sql += access
        else this.sql += this.quoteString(access)
      }
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
      this.sql += `$${++this.paramIndex}`
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
        DOUBLE_QUOTE +
        identifier.replace(MATCH_DOUBLE_QUOTE, ESCAPE_DOUBLE_QUOTE) +
        DOUBLE_QUOTE
    }
    emitDefaultValue() {
      this.sql += 'default'
    }
    emitIdColumn() {
      this.sql += 'integer generated always as identity'
    }
    emitLastInsertId() {
      this.sql += 'lastval()'
    }
  }
)
