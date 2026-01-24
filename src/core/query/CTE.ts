import {type HasQuery, getQuery, getTarget} from '../Internal.ts'
import {type Sql, sql} from '../Sql.ts'
import type {VirtualTarget} from '../Virtual.ts'
import type {QueryBase} from './Query.ts'

export type CTE<Input = unknown> = VirtualTarget<Input> & HasQuery

export function formatCTE(query: QueryBase): Sql | undefined {
  const isRecursive = query.withRecursive
  const definitions = isRecursive ? query.withRecursive! : query.with
  if (!definitions) return
  return sql.query({
    [isRecursive ? 'withRecursive' : 'with']: sql.join(
      definitions.map(cte => {
        const query = getQuery(cte)
        const target = getTarget(cte)
        return sql`${target} as (${query})`
      }),
      sql`, `
    )
  })
}
