import type {Transaction} from '../core/Database.ts'
import type {QueryMeta} from '../core/MetaData.ts'

type Part<Meta extends QueryMeta> =
  | Promise<unknown>
  | ((tx: Transaction<Meta>) => unknown)
type Create<Meta extends QueryMeta, T> = (
  tx: Transaction<Meta>
) => Generator<Part<Meta>, T>

export function generateTransaction<
  Result = void,
  Meta extends QueryMeta = QueryMeta
>(create: Create<Meta, Result>) {
  function run(tx: Transaction<Meta>): Result | Promise<Result> {
    const iter = create(tx)
    const take = (intermediate?: any): any => {
      const {value, done}: IteratorResult<Part<Meta>> = iter.next(intermediate)
      if (done) return value
      if (typeof value === 'function') return take(tx.transaction(value))
      return value instanceof Promise ? value.then(take) : value
    }
    return take()
  }
  return Object.assign(run, {
    *[Symbol.iterator](): Generator<Part<Meta>> {
      return yield run
    }
  })
}
