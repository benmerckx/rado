import type {Transaction} from '../core/Database.ts'
import type {Deliver, QueryMeta} from '../core/MetaData.ts'

export function run<Yield, Result>(
  iterator: Generator<Yield, Result>,
  resolve: (value: Yield) => unknown
): Result | Promise<Result> {
  function advance(
    result: IteratorResult<Yield, Result>
  ): Result | Promise<Result> {
    if (result.done) return result.value
    let resolved: unknown
    try {
      resolved = resolve(result.value)
    } catch (error) {
      return fail(error)
    }
    if (resolved instanceof Promise) return resolved.then(next, fail)
    return next(resolved)
  }
  function next(value?: unknown) {
    return advance(iterator.next(value))
  }
  function fail(error: unknown) {
    return advance(iterator.throw(error))
  }
  return next()
}

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
  function execute(tx: Transaction<Meta>): Deliver<Meta, Result> {
    return run(create(tx), value =>
      typeof value === 'function' ? tx.transaction(value) : value
    ) as Deliver<Meta, Result>
  }
  return Object.assign(execute, {
    *[Symbol.iterator](): Generator<Part<Meta>> {
      return yield execute
    }
  })
}
