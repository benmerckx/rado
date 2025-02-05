import {type HasSql, getSql, getTable, hasSql, hasTable} from '../Internal.ts'
import {type Sql, sql} from '../Sql.ts'

export type Input<T = unknown> = HasSql<T> | T

export function input<T>(value: Input<T>): Sql<T> {
  if (typeof value !== 'object' || value === null) return sql.value(value)
  if (hasTable(value)) return sql.identifier(getTable(value).name)
  if (hasSql(value)) return getSql(value)
  return sql.value(value)
}
