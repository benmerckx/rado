import type {ColumnData} from '../Column.ts'
import {
  type HasSql,
  getField,
  getSql,
  getTable,
  hasField,
  hasSql,
  hasTable
} from '../Internal.ts'
import {type Sql, sql} from '../Sql.ts'

export type Input<T = unknown> = HasSql<T> | T

export function input<T>(value: Input<T>, maybeField?: Input<T>): Sql<T> {
  const isObject = value && typeof value === 'object'
  if (isObject && hasTable(value))
    return sql.identifier(getTable(value).aliased)
  if (isObject && hasSql(value)) return getSql(value)
  const fieldSource =
    maybeField &&
    typeof maybeField === 'object' &&
    hasField(maybeField) &&
    getField(maybeField).source
  return fieldSource && 'mapToDriverValue' in fieldSource
    ? mapToColumn(fieldSource as ColumnData, value)
    : sql.value(value)
}

export function mapToColumn<T>(
  {mapToDriverValue}: ColumnData,
  expr: Input<T>
): Sql<T> {
  const isObject = expr && typeof expr === 'object'
  if (isObject && hasSql(expr)) return getSql(expr)
  return input(
    expr !== null && mapToDriverValue ? mapToDriverValue(expr) : expr
  ) as Sql<T>
}
