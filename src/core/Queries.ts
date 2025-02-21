import {
  type HasQuery,
  type HasResolver,
  type HasSql,
  getData,
  getResolver,
  hasSelection,
  internalData,
  internalQuery
} from './Internal.ts'
import type {Deliver, QueryMeta} from './MetaData.ts'
import type {PreparedStatement, Resolver} from './Resolver.ts'
import type {Sql} from './Sql.ts'

export class QueryData<Meta extends QueryMeta> {
  resolver?: Resolver<Meta>
  first?: boolean
}

type Exec = Function

class Executable<Result, Meta extends QueryMeta>
  implements PromiseLike<Result>
{
  private declare brand: [Meta]

  #execute: Exec
  constructor(exec: Exec) {
    this.#execute = exec
  }

  *[Symbol.iterator](): Generator<Promise<unknown>, Result, unknown> {
    const interim = this.#execute()
    const isAsync = interim instanceof Promise
    if (!isAsync) return interim as Result
    let result: unknown
    yield interim.then(v => (result = v))
    return result as Result
  }

  run(): Deliver<Meta, void> {
    return this.#execute()
  }

  // biome-ignore lint/suspicious/noThenProperty:
  async then<TResult1 = Result, TResult2 = never>(
    onfulfilled?:
      | ((value: Result) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null
  ): Promise<TResult1 | TResult2> {
    try {
      const result = await this.#execute()
      return onfulfilled ? onfulfilled(result) : result
    } catch (error) {
      return onrejected ? onrejected(error) : Promise.reject(error)
    }
  }

  catch<TResult = never>(
    onrejected?:
      | ((reason: unknown) => TResult | PromiseLike<TResult>)
      | undefined
      | null
  ): Promise<Result | TResult> {
    return this.then().catch(onrejected)
  }

  finally(onfinally?: (() => void) | undefined | null): Promise<Result> {
    return this.then().finally(onfinally)
  }
}

export class BatchQuery<Results, Meta extends QueryMeta> extends Executable<
  Array<Results>,
  Meta
> {
  constructor(queryResolver: Resolver, queries: Array<HasSql | HasQuery>) {
    super(() => {
      return queryResolver.batch(queries).execute()
    })
  }
}

export abstract class SingleQuery<
  Result,
  Meta extends QueryMeta
> extends Executable<Result, Meta> {
  readonly [internalData]: QueryData<Meta>
  abstract [internalQuery]: Sql

  constructor(data: QueryData<Meta>) {
    super(() => this.#exec(undefined))
    this[internalData] = data
  }

  #exec(method: 'all' | 'get' | 'run' | undefined, db?: HasResolver) {
    const data = getData(this)
    const resolver = db ? getResolver(db) : data.resolver
    if (!resolver) throw new Error('Query has no resolver')
    const isSelection = hasSelection(this)
    const isFirst = data.first
    const prepared = resolver.prepare(this, '')
    const resultType =
      method ?? (isSelection ? (isFirst ? 'get' : 'all') : 'run')
    try {
      const result = prepared[resultType]()
      if (result instanceof Promise)
        return result
          .then(res => res ?? null)
          .finally(prepared.free.bind(prepared))
      prepared.free()
      return result ?? null
    } catch (error) {
      prepared.free()
      throw error
    }
  }

  all<Result extends Array<unknown>>(
    this: SingleQuery<Result, Meta>,
    db?: HasResolver
  ): Deliver<Meta, Result> {
    return this.#exec('all', db) as Deliver<Meta, Result>
  }

  get<Result extends Array<unknown>>(
    this: SingleQuery<Result, Meta>,
    db?: HasResolver
  ): Deliver<Meta, Result[number] | null>
  get(db?: HasResolver): Deliver<Meta, Result | null>
  get(db?: HasResolver) {
    return this.#exec('get', db) as Deliver<Meta, Result | null>
  }

  run(db?: HasResolver): Deliver<Meta, void> {
    return this.#exec('run', db) as Deliver<Meta, void>
  }

  prepare<Inputs extends Record<string, unknown>>(
    name?: string
  ): PreparedQuery<Result, Inputs, Meta> {
    return <PreparedQuery<Result, Inputs, Meta>>(
      getData(this).resolver!.prepare(this, name)
    )
  }

  toSQL(db?: HasResolver): {sql: string; params: Array<unknown>} {
    const resolver = db ? getResolver(db) : getData(this).resolver
    if (!resolver) throw new Error('Query has no resolver')
    return resolver.toSQL(this)
  }
}

export interface PreparedQuery<
  Result,
  Inputs extends Record<string, unknown>,
  Meta extends QueryMeta
> extends PreparedStatement<Meta> {
  all<Result extends Array<unknown>>(
    this: PreparedQuery<Result, Inputs, Meta>,
    inputs?: Inputs
  ): Deliver<Meta, Result>
  get(inputs?: Inputs): Deliver<Meta, Result>
  get<Result extends Array<unknown>>(
    this: PreparedQuery<Result, Inputs, Meta>,
    inputs?: Inputs
  ): Deliver<Meta, Result[number] | null>
  run(inputs?: Inputs): Deliver<Meta, void>
  execute(inputs?: Inputs): Promise<Result>
  free(): void
}
