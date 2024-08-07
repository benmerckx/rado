import {getSql, getTable, hasSql, hasTable, type HasSql} from '../Internal.ts'
import {sql, type Sql} from '../Sql.ts'

export type Input<T = unknown> = HasSql<T> | T

export function input<T>(value: Input<T>): Sql<T> {
  if (typeof value !== 'object' || value === null) return sql.value(value)
  if (hasTable(value)) return sql.identifier(getTable(value).name)
  if (hasSql(value)) return getSql(value) as Sql<T>
  return sql.value(value)
}
