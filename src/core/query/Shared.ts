import type {ColumnData} from '../Column.ts'
import {getSql, hasSql} from '../Internal.ts'
import {type Sql, sql} from '../Sql.ts'
import {type Input, input} from '../expr/Input.ts'
import type {ResultModifiers} from './Query.ts'

export function formatModifiers(modifiers: ResultModifiers): Sql | undefined {
  const {orderBy, limit, offset} = modifiers
  if (!orderBy && limit === undefined && offset === undefined) return undefined
  return sql.query({
    orderBy:
      orderBy &&
      sql.join(
        orderBy.map(part => {
          const {alias} = getSql(part)
          if (alias) return sql.identifier(alias)
          return part
        }),
        sql`, `
      ),
    limit: limit !== undefined && input(limit),
    offset: offset !== undefined && input(offset)
  })
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
