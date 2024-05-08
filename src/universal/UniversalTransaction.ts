import type {Transaction} from '../core/Database.ts'
import type {QueryMeta} from '../core/MetaData.ts'

export function generateTransaction<
  T = void,
  Meta extends QueryMeta = QueryMeta
>(
  gen: (tx: Transaction<Meta>) => Generator<Promise<unknown>, T>
): (tx: Transaction<Meta>) => Promise<T> {
  return async (tx: Transaction<Meta>) => {
    const iter = gen(tx)
    let current: IteratorResult<Promise<unknown>>
    while ((current = iter.next(tx))) {
      if (current.done) return current.value
      await current.value
    }
  }
}
