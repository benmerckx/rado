import {input} from '../expr/Input.ts'
import {getSql} from '../Internal.ts'
import type {Selection} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import type {ResultModifiers} from './Query.ts'

export function formatModifiers(
  modifiers: ResultModifiers,
  selected?: Selection
): Sql | undefined {
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
          const inner = getSql(part)
          const alias = selected?.aliasOf(part) ?? inner.alias
          if (alias) return sql.identifier(alias)
          return part
        }),
        sql`, `
      ),
    limit: normalizedLimit !== undefined && input(normalizedLimit),
    offset: offset !== undefined && input(offset)
  })
}
