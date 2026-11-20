import type {
  FullQueryResults,
  NeonQueryFunction
} from '@neondatabase/serverless'
import {AsyncDatabase, type DatabaseOptions} from '../core/Database.ts'
import type {AsyncDriver, AsyncStatement, BatchedQuery} from '../core/Driver.ts'
import type {MutationResultBase} from '../core/MetaData.ts'
import {postgresDialect} from '../postgres/dialect.ts'
import {postgresDiff} from '../postgres/diff.ts'

type Client = NeonQueryFunction<boolean, boolean>

class PreparedStatement implements AsyncStatement {
  constructor(
    private client: Client,
    private sql: string
  ) {}

  #query<ArrayMode extends boolean>(
    params: Array<unknown>,
    arrayMode: ArrayMode
  ): Promise<FullQueryResults<ArrayMode>> {
    return this.client.query(this.sql, params, {arrayMode, fullResults: true})
  }

  all(params: Array<unknown>): Promise<Array<object>> {
    return this.#query(params, false).then(res => res.rows)
  }

  async run(params: Array<unknown>): Promise<MutationResultBase> {
    const result = await this.#query(params, true)
    return {affectedRows: result.rowCount ?? 0}
  }

  get(params: Array<unknown>): Promise<object | null> {
    return this.all(params).then(rows => rows[0] ?? null)
  }

  values(params: Array<unknown>): Promise<Array<Array<unknown>>> {
    return this.#query(params, true).then(res => res.rows)
  }

  free() {}
}

export class NeonHttpDriver implements AsyncDriver {
  parsesJson = true
  supportsTransactions = false

  constructor(private client: Client) {}

  async exec(query: string) {
    await this.client.query(query)
  }

  prepare(sql: string): PreparedStatement {
    return new PreparedStatement(this.client, sql)
  }

  async close(): Promise<void> {}

  async batch(queries: Array<BatchedQuery>): Promise<Array<Array<unknown>>> {
    if (queries.length === 0) return []
    const results = await this.client.transaction(
      queries.map(({sql, params}) => this.client.query(sql, params)),
      {arrayMode: true, fullResults: true}
    )
    return results.map((result, index) =>
      queries[index]?.isSelection ? result.rows : []
    )
  }

  async transaction<T>(): Promise<T> {
    throw new Error('Transactions are not supported over Neon HTTP')
  }
}

export function connect(
  client: Client,
  options?: DatabaseOptions
): AsyncDatabase<'postgres'> {
  return new AsyncDatabase(
    new NeonHttpDriver(client),
    postgresDialect,
    postgresDiff,
    options
  )
}
