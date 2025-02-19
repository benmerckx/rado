import {Dialect} from '../core/Dialect.ts'
import {Emitter} from '../core/Emitter.ts'
import type {Runtime} from '../core/MetaData.ts'
import {NamedParam, ValueParam} from '../core/Param.ts'
import type {JsonPath} from '../core/expr/Json.ts'

const DOUBLE_QUOTE = '"'
const ESCAPE_DOUBLE_QUOTE = '""'
const MATCH_DOUBLE_QUOTE = /"/g
const SINGLE_QUOTE = "'"
const ESCAPE_SINGLE_QUOTE = "''"
const MATCH_SINGLE_QUOTE = /'/g

export const postgresDialect: Dialect = new Dialect(
  'postgres',
  class extends Emitter {
    runtime: Runtime = 'postgres'
    emitValue(value: unknown) {
      this.params.push(new ValueParam(value))
      this.sql += `$${this.params.length}`
    }
    emitPlaceholder(name: string) {
      this.params.push(new NamedParam(name))
      this.sql += `$${this.params.length}`
    }
    emitJsonPath({target, asSql, segments}: JsonPath) {
      target.emit(this)
      for (let i = 0; i < segments.length; i++) {
        const access = segments[i]
        if (i <= segments.length - 2) this.sql += '->'
        else if (i === segments.length - 1) this.sql += asSql ? '->>' : '->'
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
  }
)
