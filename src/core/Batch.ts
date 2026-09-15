import {run} from '../universal/transactions.ts'
import type {AsyncDriver, BatchedQuery, Driver, SyncDriver} from './Driver.ts'
import type {QueryMeta} from './MetaData.ts'
import type {MapRowContext} from './Selection.ts'

export type RowMapper = ((ctx: MapRowContext) => unknown) | undefined

interface QueryWithMapRow extends BatchedQuery {
  mapRow: RowMapper
}

export class Batch<Meta extends QueryMeta> {
  declare private brand: [Meta]
  #driver: Driver
  #queries: Array<QueryWithMapRow>

  constructor(driver: Driver, queries: Array<QueryWithMapRow>) {
    this.#driver = driver
    this.#queries = queries
  }

  #transform = (results: Array<Array<unknown>>) => {
    const ctx: MapRowContext = {
      values: undefined!,
      index: 0,
      specs: this.#driver
    }
    for (let i = 0; i < this.#queries.length; i++) {
      const {mapRow} = this.#queries[i]
      if (!mapRow) continue
      const rows = results[i] as Array<Array<unknown>>
      for (let j = 0; j < results[i].length; j++) {
        ctx.values = rows[j]
        ctx.index = 0
        rows[j] = mapRow(ctx) as Array<unknown>
      }
    }
    return results
  }

  execute(): Array<unknown> | Promise<Array<unknown>> {
    const results = this.#driver.batch(this.#queries)
    if (results instanceof Promise) return results.then(this.#transform)
    return this.#transform(results)
  }

  /** @internal */
  static run(
    driver: SyncDriver,
    queries: Array<BatchedQuery>
  ): Array<Array<unknown>>
  static run(
    driver: AsyncDriver,
    queries: Array<BatchedQuery>
  ): Promise<Array<Array<unknown>>>
  static run(
    driver: Driver,
    queries: Array<BatchedQuery>
  ): Array<Array<unknown>> | Promise<Array<Array<unknown>>> {
    return run(statements(), value => value)

    function* statements(): Generator<Promise<Array<Array<unknown>>>> {
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
}
