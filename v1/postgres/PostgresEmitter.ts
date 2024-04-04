import type {Emitter} from '../core/Emitter.ts'
import {getQuery, type HasQuery} from '../core/Internal.ts'
import type {SqlEmmiter} from '../core/Sql.ts'

const DOUBLE_QUOTE = '"'
const ESCAPE_DOUBLE_QUOTE = '""'
const MATCH_DOUBLE_QUOTE = /"/g
const SINGLE_QUOTE = "'"
const ESCAPE_SINGLE_QUOTE = "''"
const MATCH_SINGLE_QUOTE = /'/g

export class PostgresEmitter implements Emitter, SqlEmmiter {
  paramIndex = 0
  emit(query: HasQuery): [string, Array<unknown>] {
    this.paramIndex = 0
    return getQuery(query).emit(this)
  }
  emitValue(value: unknown): [string, unknown] {
    return [`$${++this.paramIndex}`, value]
  }
  emitJsonPath(path: Array<number | string>): string {
    let result = ''
    for (let i = 0; i < path.length; i++) {
      const access = path[i]
      if (typeof access === 'number') result += access
      else result += this.emitString(access)
      if (i < path.length - 2) result += '->>'
      else if (i < path.length - 1) result += '->'
    }
    return result
  }
  emitInline(value: unknown): string {
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value)
    if (typeof value === 'string') return this.emitString(value)
    return `json(${this.emitString(JSON.stringify(value))})`
  }
  emitPlaceholder(name: string): string {
    throw new Error('todo')
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
    return 'default'
  }
}
