import type {ColumnData} from '../Column.ts'
import {type HasValue, get} from '../Internal.ts'
import {type Sql, sql} from '../Sql.ts'

export type Input<T = unknown> = HasValue<T> | T

export function input<T>(value: Input<T>, maybeField?: Input<T>): Sql<T> {
  const isObject = value && typeof value === 'object'
  if (isObject) {
    const {table, value: sqlValue} = get(value)
    if (table) return sql.identifier(table.aliased) as Sql<T>
    if (sqlValue) return sqlValue as Sql<T>
  }
  const fieldSource =
    maybeField &&
    typeof maybeField === 'object' &&
    get(maybeField).field?.source
  return fieldSource && 'mapToDriverValue' in fieldSource
    ? mapToColumn(fieldSource as ColumnData, value)
    : sql.value(value)
}

export function mapToColumn<T>(
  {mapToDriverValue}: ColumnData,
  expr: Input<T>
): Sql<T> {
  const isObject = expr && typeof expr === 'object'
  if (isObject) {
    const {value} = get(expr)
    if (value) return value as Sql<T>
  }
  return input(
    expr !== null && mapToDriverValue ? mapToDriverValue(expr) : expr
  ) as Sql<T>
}
