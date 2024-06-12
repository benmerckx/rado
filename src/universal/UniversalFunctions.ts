import {sql, type Sql} from '../core/Sql.ts'
import {input, type Input} from '../core/expr/Input.ts'

export function lastInsertId() {
  return sql.chunk('emitLastInsertId', undefined).mapWith(Number)
}

export function concat(...slices: Array<Input<string>>): Sql<string> {
  return sql`concat(${sql.join(slices.map(input), sql`, `)})`
}
