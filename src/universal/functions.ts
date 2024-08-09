import {type Sql, sql} from '../core/Sql.ts'
import {callFunction} from '../core/expr/Functions.ts'
import type {Input} from '../core/expr/Input.ts'

const insertId = sql
  .universal({
    sqlite: sql`last_insert_rowid()`,
    postgres: sql`lastval()`,
    mysql: sql`last_insert_id()`
  })
  .mapWith(Number)

export function lastInsertId(): Sql<number> {
  return insertId
}

export function concat(...slices: Array<Input<string | null>>): Sql<string> {
  return callFunction(sql`concat`, slices)
}
