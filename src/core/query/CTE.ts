import {
  type HasQuery,
  type HasTarget,
  getQuery,
  getSelection,
  getTarget,
  internalQuery
} from '../Internal.ts'
import type {SelectionInput} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import type {QueryBase} from './Query.ts'
import type {UnionBase} from './Select.ts'

export type CTE<Input = unknown> = Input & HasTarget & HasQuery

export function createCTE<Input extends SelectionInput>(
  cteName: string,
  query: UnionBase<Input>
): CTE<Input> {
  const fields = getSelection(query).makeVirtual(cteName)
  return Object.assign(<any>fields, {
    [internalQuery]: getQuery(query).nameSelf(cteName)
  })
}

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
