import {getSql} from '../Internal.ts'
import {type Sql, sql} from '../Sql.ts'
import {input} from '../expr/Input.ts'
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
