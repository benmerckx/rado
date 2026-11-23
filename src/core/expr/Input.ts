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
import {placeholders} from '../Param.ts'
import {Sql, sql} from '../Sql.ts'

export type Input<T = unknown> = HasSql<T> | T

export function input<T>(value: Input<T>, maybeField?: Input<T>): Sql<T> {
  const isObject = value && typeof value === 'object'
  if (isObject && hasTable(value))
    return sql.identifier(getTable(value).aliased)
  const fieldSource =
    maybeField &&
    typeof maybeField === 'object' &&
    hasField(maybeField) &&
    getField(maybeField).source
  if (fieldSource && 'mapToDriverValue' in fieldSource)
    return mapToColumn(fieldSource as ColumnData, value)
  if (isObject && hasSql(value)) return getSql(value)
  return sql.value(value)
}

export function mapToColumn<T>(
  {mapToDriverValue, type}: ColumnData,
  expr: Input<T>
): Sql<T> {
  const isObject = expr && typeof expr === 'object'
  if (isObject && hasSql(expr)) {
    const inner = getSql(expr)
    const name = placeholders.get(inner)
    if (name === undefined || !mapToDriverValue) return inner
    return new Sql(emitter => emitter.emitPlaceholder(name, mapToDriverValue))
  }
  if (Array.isArray(expr) && type.kind === 'array') {
    if (!mapToDriverValue) return input(expr as T)
    return input(mapToDriverValue(expr) as T)
  }
  return input(
    expr !== null && mapToDriverValue ? mapToDriverValue(expr) : expr
  ) as Sql<T>
}
