import {
  getData,
  getResolver,
  hasResolver,
  hasSelection,
  internalData,
  internalQuery,
  type HasQuery,
  type HasResolver,
  type HasTarget
} from './Internal.ts'
import type {Async, Either, QueryMeta, Sync} from './MetaData.ts'
import type {PreparedStatement, Resolver} from './Resolver.ts'
import type {Sql} from './Sql.ts'

export class QueryData<Meta extends QueryMeta> {
  resolver?: Resolver<Meta>
  cte?: Array<HasQuery & HasTarget>
}

export abstract class Query<Result, Meta extends QueryMeta>
  implements PromiseLike<Array<Result>>
{
  readonly [internalData]: QueryData<Meta>
  abstract [internalQuery]: Sql

  constructor(data: QueryData<Meta>) {
    this[internalData] = data
  }

  #exec(
    method: 'all' | 'get' | 'run' | undefined,
    db?: HasResolver | Resolver
  ): any {
    const resolver = db
      ? hasResolver(db)
        ? getResolver(db)
        : db
      : getData(this).resolver
    const isSelection = hasSelection(this)
    const prepared = resolver!.prepare(this, '')
    const resultType = method ?? (isSelection ? 'all' : 'run')
    try {
      const result = prepared[resultType]()
      if (result instanceof Promise)
        return result.finally(prepared.free.bind(prepared))
      prepared.free()
      return result
    } catch (error) {
      prepared.free()
      throw error
    }
  }

  *[Symbol.iterator](): Generator<Promise<unknown>, Array<Result>, unknown> {
    const interim = this.#exec(undefined)
    const isAsync = interim instanceof Promise
    if (!isAsync) return interim as Array<Result>
    let result: unknown
    yield interim.then(v => (result = v))
    return result as Array<Result>
  }

  prepare<Inputs extends Record<string, unknown>>(name?: string) {
    return <PreparedQuery<Result, Inputs, Meta>>(
      getData(this).resolver!.prepare(this, name)
    )
  }

  all(this: Query<Result, Sync>): Array<Result>
  all(this: Query<Result, Async>): Promise<Array<Result>>
  all(db: HasResolver<Sync> | Resolver<Sync>): Array<Result>
  all(db: HasResolver<Async> | Resolver<Async>): Promise<Array<Result>>
  all(db?: HasResolver | Resolver) {
    return this.#exec('all', db)
  }

  get(this: Query<Result, Sync>): Result
  get(this: Query<Result, Async>): Promise<Result>
  get(this: Query<Result, Either>): Result | Promise<Result>
  get(db: HasResolver<Sync> | Resolver<Sync>): Result
  get(db: HasResolver<Async> | Resolver<Async>): Promise<Result>
  get(db?: HasResolver | Resolver) {
    return this.#exec('get', db)
  }

  run(this: Query<Result, Sync>): void
  run(this: Query<Result, Async>): Promise<void>
  run(db: HasResolver<Sync> | Resolver<Sync>): void
  run(db: HasResolver<Async> | Resolver<Async>): Promise<void>
  run(db?: HasResolver | Resolver) {
    return this.#exec('run', db)
  }

  // biome-ignore lint/suspicious/noThenProperty:
  then<TResult1 = Array<Result>, TResult2 = never>(
    this: Query<Result, Sync | Async>,
    onfulfilled?:
      | ((value: Array<Result>) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null
  ): Promise<TResult1 | TResult2> {
    const resolver = getData(this).resolver
    const result = this.#exec(undefined, resolver as Resolver<any>)
    return Promise.resolve(result).then(onfulfilled, onrejected)
  }

  catch<TResult = never>(
    this: Query<Result, Async>,
    onrejected?:
      | ((reason: unknown) => TResult | PromiseLike<TResult>)
      | undefined
      | null
  ): Promise<Array<Result> | TResult> {
    return this.#exec(undefined).catch(onrejected)
  }

  finally(
    this: Query<Result, Async>,
    onfinally?: (() => void) | undefined | null
  ): Promise<Array<Result>> {
    return this.#exec(undefined).finally(onfinally)
  }
}

export interface PreparedQuery<
  Result,
  Inputs extends Record<string, unknown>,
  Meta extends QueryMeta
> extends PreparedStatement<Meta> {
  all(this: PreparedQuery<Result, Inputs, Sync>, inputs?: Inputs): Array<Result>
  all(
    this: PreparedQuery<Result, Inputs, Async>,
    inputs?: Inputs
  ): Promise<Array<Result>>

  get(this: PreparedQuery<Result, Inputs, Sync>, inputs?: Inputs): Result
  get(
    this: PreparedQuery<Result, Inputs, Async>,
    inputs?: Inputs
  ): Promise<Result>

  run(this: PreparedQuery<Result, Inputs, Sync>, inputs?: Inputs): void
  run(
    this: PreparedQuery<Result, Inputs, Async>,
    inputs?: Inputs
  ): Promise<void>

  execute(inputs?: Inputs): Promise<Array<Result>>
}
