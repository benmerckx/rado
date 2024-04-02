import {Builder} from '../core/Builder.ts'
import {
  type HasQuery,
  type HasSql,
  getQuery,
  getSql,
  hasSql
} from '../core/Internal.ts'
import type {Sql, SqlEmmiter} from '../core/Sql.ts'

const testEmitter: SqlEmmiter = {
  emitValue: v => [JSON.stringify(v), []],
  emitInline: JSON.stringify,
  emitJsonPath: path => `->${JSON.stringify(`$.${path.join('.')}`)}`,
  emitIdentifier: JSON.stringify,
  emitPlaceholder: (name: string) => `?${name}`,
  emitDefaultValue: () => 'default'
}

export function emit(input: HasSql | HasQuery): string {
  const sql: Sql = hasSql(input) ? getSql(input) : getQuery(input)
  return sql.emit(testEmitter)[0]
}

export const builder = new Builder({})
