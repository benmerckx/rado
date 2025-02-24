import {type Sql, sql} from '../core/Sql.ts'
import {Functions} from '../core/expr/Functions.ts'
import {type Input, input} from '../core/expr/Input.ts'

const insertId = sql
  .universal({
    sqlite: Functions.last_insert_rowid(),
    postgres: Functions.lastval(),
    mysql: Functions.last_insert_id()
  })
  .mapWith(Number)

export function lastInsertId(): Sql<number> {
  return insertId
}

export function concat(...slices: Array<Input<string | null>>): Sql<string> {
  return sql.universal({
    mysql: Functions.concat(...slices),
    default: sql.join(
      slices.map(slice => input(slice)),
      sql` || `
    )
  })
}
