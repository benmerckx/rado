import type {Transaction} from '../core/Database.ts'
import type {Deliver, QueryMeta} from '../core/MetaData.ts'

type Part<Meta extends QueryMeta> =
  | Promise<unknown>
  | ((tx: Transaction<Meta>) => unknown)
type Create<Meta extends QueryMeta, T> = (
  tx: Transaction<Meta>
) => Generator<Part<Meta>, T>
export interface TxGenerator<Meta extends QueryMeta, Result> {
  (tx: Transaction<Meta>): Deliver<Meta, Result>
  [Symbol.iterator](): Generator<Part<Meta>, Result>
}

export function txGenerator<Result = void, Meta extends QueryMeta = QueryMeta>(
  create: Create<Meta, Result>
): TxGenerator<Meta, Result> {
  function run(tx: Transaction<Meta>): Deliver<Meta, Result> {
    const iter = create(tx)
    const next = (inner?: any) => {
      if (inner instanceof Promise)
        return inner
          .then(iter.next.bind(iter))
          .catch(iter.throw.bind(iter))
          .then(handle)
      try {
        return handle(iter.next(inner))
      } catch (err) {
        return handle(iter.throw(err))
      }
    }
    const handle = ({done, value}: IteratorResult<Part<Meta>>): any => {
      if (done) return value
      return next(typeof value === 'function' ? tx.transaction(value) : value)
    }
    return next()
  }
  return Object.assign(run, {
    *[Symbol.iterator](): Generator<Part<Meta>> {
      return yield run
    }
  })
}
