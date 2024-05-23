import type {Emitter} from './Emitter.ts'
import {
  getQuery,
  getSql,
  hasSql,
  type HasQuery,
  type HasSql
} from './Internal.ts'

export function dialect(createEmitter: new () => Emitter) {
  return {
    emit(input: HasSql | HasQuery) {
      const sql = hasSql(input) ? getSql(input) : getQuery(input)
      const emitter = new createEmitter()
      sql.emit(emitter)
      return emitter
    }
  }
}

export type Dialect = ReturnType<typeof dialect>
