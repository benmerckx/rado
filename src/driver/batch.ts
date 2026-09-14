import type {
  AsyncDriver,
  BatchedQuery,
  Driver,
  SyncDriver
} from '../core/Driver.ts'
import {run} from '../universal/transactions.ts'

export function executeBatch(
  driver: SyncDriver,
  queries: Array<BatchedQuery>
): Array<Array<unknown>>
export function executeBatch(
  driver: AsyncDriver,
  queries: Array<BatchedQuery>
): Promise<Array<Array<unknown>>>
export function executeBatch(
  driver: Driver,
  queries: Array<BatchedQuery>
): Array<Array<unknown>> | Promise<Array<Array<unknown>>> {
  return run(statements(), value => value)

  function* statements(): Generator<
    Promise<Array<Array<unknown>>>,
    Array<Array<unknown>>,
    Array<Array<unknown>>
  > {
    const results = []
    for (const {sql, params, isSelection} of queries) {
      const statement = driver.prepare(sql, {isSelection})
      try {
        const rows = statement.values(params)
        results.push(rows instanceof Promise ? yield rows : rows)
      } finally {
        statement.free()
      }
    }
    return results
  }
}
