import type {Sql, SqlEmmiter} from '../lib/Sql.ts'

export class SqliteEmitter implements SqlEmmiter {
  emit(sql: Sql): [string, Array<unknown>] {
    return sql.emit(this)
  }

  emitValue(value: unknown): [string, Array<unknown>] {
    return [JSON.stringify(value), []]
  }

  emitPlaceholder(name: string): string {
    return `?${name}`
  }

  emitIdentifier(identifier: string): string {
    return JSON.stringify(identifier)
  }

  emitDefaultValue(): string {
    return 'default'
  }
}
