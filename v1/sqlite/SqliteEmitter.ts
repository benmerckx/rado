import type {Emitter} from '../core/Emitter.ts'
import {getQuery, type HasQuery} from '../core/Internal.ts'
import type {SqlEmmiter} from '../core/Sql.ts'

const DOUBLE_QUOTE = '"'
const ESCAPE_DOUBLE_QUOTE = '""'
const MATCH_DOUBLE_QUOTE = /"/g
const SINGLE_QUOTE = "'"
const ESCAPE_SINGLE_QUOTE = "''"
const MATCH_SINGLE_QUOTE = /'/g

export class SqliteEmitter implements Emitter, SqlEmmiter {
  emit(query: HasQuery): [string, Array<unknown>] {
    return getQuery(query).emit(this)
  }
  emitValue(value: unknown): [string, unknown] {
    return ['?', value]
  }
  emitPlaceholder(name: string): string {
    return `?${name}`
  }
  emitString(input: string): string {
    return (
      SINGLE_QUOTE +
      input.replace(MATCH_SINGLE_QUOTE, ESCAPE_SINGLE_QUOTE) +
      SINGLE_QUOTE
    )
  }
  emitIdentifier(identifier: string): string {
    return (
      DOUBLE_QUOTE +
      identifier.replace(MATCH_DOUBLE_QUOTE, ESCAPE_DOUBLE_QUOTE) +
      DOUBLE_QUOTE
    )
  }
  emitDefaultValue(): string {
    return 'null'
  }
}
