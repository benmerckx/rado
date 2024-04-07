import type {Emitter} from './Emitter.ts'
import {
  type HasQuery,
  type HasSql,
  getQuery,
  getSql,
  hasSql
} from './Internal.ts'

export function dialect(createEmitter: {new (): Emitter}) {
  return (input: HasSql | HasQuery) => {
    const sql = hasSql(input) ? getSql(input) : getQuery(input)
    const emitter = new createEmitter()
    sql.emit(emitter)
    return emitter
  }
}

export type Dialect = ReturnType<typeof dialect>
