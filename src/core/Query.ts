import {
  getData,
  getResolver,
  hasSelection,
  internalData,
  internalQuery,
  type HasQuery,
  type HasResolver,
  type HasSql,
  type HasTarget
} from './Internal.ts'
import type {Async, Either, QueryMeta, Sync} from './MetaData.ts'
import type {PreparedStatement, Resolver} from './Resolver.ts'
import type {Sql} from './Sql.ts'

export class QueryData<Meta extends QueryMeta> {
  resolver?: Resolver<Meta>
  cte?: Array<HasQuery & HasTarget>
}

type Exec = () => any

class Executable<Result, Meta extends QueryMeta>
  implements PromiseLike<Array<Result>>
{
  private declare brand: [Meta]

  #execute: Exec
  constructor(exec: Exec) {
    this.#execute = exec
  }

  *[Symbol.iterator](): Generator<Promise<unknown>, Array<Result>, unknown> {
    const interim = this.#execute()
    const isAsync = interim instanceof Promise
    if (!isAsync) return interim as Array<Result>
    let result: unknown
    yield interim.then(v => (result = v))
    return result as Array<Result>
  }

  run(this: Executable<Result, Sync>): void
  run(this: Executable<Result, Async>): Promise<void>
  run() {
    return this.#execute()
  }

  // biome-ignore lint/suspicious/noThenProperty:
  then<TResult1 = Array<Result>, TResult2 = never>(
    this: Executable<Result, Sync | Async>,
    onfulfilled?:
      | ((value: Array<Result>) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null
  ): Promise<TResult1 | TResult2> {
    const result = this.#execute()
    return Promise.resolve(result).then(onfulfilled, onrejected)
  }

  catch<TResult = never>(
    this: Executable<Result, Async>,
    onrejected?:
      | ((reason: unknown) => TResult | PromiseLike<TResult>)
      | undefined
      | null
  ): Promise<Array<Result> | TResult> {
    return this.then().catch(onrejected)
  }

  finally(
    this: Executable<Result, Async>,
    onfinally?: (() => void) | undefined | null
  ): Promise<Array<Result>> {
    return this.then().finally(onfinally)
  }
}

export class QueryBatch<Results, Meta extends QueryMeta> extends Executable<
  Results,
  Meta
> {
  constructor(queryResolver: Resolver, queries: Array<HasSql | HasQuery>) {
    super(() => {
      return queryResolver.batch(queries).execute()
    })
  }
}

export abstract class Query<Result, Meta extends QueryMeta> extends Executable<
  Result,
  Meta
> {
  readonly [internalData]: QueryData<Meta>
  abstract [internalQuery]: Sql

  constructor(data: QueryData<Meta>) {
    super(() => this.#exec(undefined))
    this[internalData] = data
  }

  #exec(method: 'all' | 'get' | 'run' | undefined, db?: HasResolver) {
    const data = getData(this)
    const resolver = db ? getResolver(db) : data.resolver
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

  all(this: Executable<Result, Sync>): Array<Result>
  all(this: Executable<Result, Async>): Promise<Array<Result>>
  all(db: HasResolver<Sync>): Array<Result>
  all(db: HasResolver<Async>): Promise<Array<Result>>
  all(db?: HasResolver) {
    return this.#exec('all', db)
  }

  get(this: Executable<Result, Sync>): Result
  get(this: Executable<Result, Async>): Promise<Result>
  get(this: Executable<Result, Either>): Result | Promise<Result>
  get(db: HasResolver<Sync>): Result
  get(db: HasResolver<Async>): Promise<Result>
  get(db: HasResolver<Either>): Result | Promise<Result>
  get(db?: HasResolver) {
    return this.#exec('get', db)
  }

  run(this: Executable<Result, Sync>): void
  run(this: Executable<Result, Async>): Promise<void>
  run(db: HasResolver<Sync>): void
  run(db: HasResolver<Async>): Promise<void>
  run(db?: HasResolver) {
    return this.#exec('run', db)
  }

  prepare<Inputs extends Record<string, unknown>>(name?: string) {
    return <PreparedQuery<Result, Inputs, Meta>>(
      getData(this).resolver!.prepare(this, name)
    )
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
