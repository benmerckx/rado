import {getSql} from '../Internal.ts'
import {type Sql, sql} from '../Sql.ts'
import {input} from '../expr/Input.ts'
import type {ResultModifiers} from './Query.ts'

export function formatModifiers(modifiers: ResultModifiers): Sql | undefined {
  const {orderBy, limit, offset} = modifiers
  const normalizedLimit =
    typeof limit === 'number' && limit < 0 ? undefined : limit
  if (!orderBy && normalizedLimit === undefined && offset === undefined)
    return undefined
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
    limit: normalizedLimit !== undefined && input(normalizedLimit),
    offset: offset !== undefined && input(offset)
  })
}
