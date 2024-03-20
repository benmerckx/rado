import type {Emitter} from '../core/Emitter.ts'
import {getQuery, type HasQuery} from '../core/Internal.ts'
import type {SqlEmmiter} from '../core/Sql.ts'

export class SqliteEmitter implements Emitter, SqlEmmiter {
  emit(query: HasQuery): [string, Array<unknown>] {
    return getQuery(query).emit(this)
  }
  emitValue(value: unknown): [string, unknown] {
    return [JSON.stringify(value), undefined]
  }
  emitPlaceholder(name: string): string {
    return `?${name}`
  }
  emitIdentifier(identifier: string): string {
    return JSON.stringify(identifier)
  }
  emitDefaultValue(): string {
    return 'null'
  }
}
