import {sql, type Sql} from '../core/Sql.ts'

export function lastInsertId() {
  return sql.chunk('emitLastInsertId', undefined) as Sql<number>
}
