import type {BatchedQuery, Driver} from './Driver.ts'
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
}
