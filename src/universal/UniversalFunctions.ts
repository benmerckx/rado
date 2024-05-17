import {sql} from '../core/Sql.ts'

export function lastInsertId() {
  return sql.chunk('emitLastInsertId', undefined).mapWith(Number)
}
