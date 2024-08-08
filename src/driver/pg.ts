import type {Client, Pool, PoolClient} from 'pg'
import {AsyncDatabase, type TransactionOptions} from '../core/Database.ts'
import type {
  AsyncDriver,
  AsyncStatement,
  BatchQuery,
  PrepareOptions
} from '../core/Driver.ts'
import {postgresDialect} from '../postgres/dialect.ts'
import {postgresDiff} from '../postgres/diff.ts'

type Queryable = Client | Pool | PoolClient

class PreparedStatement implements AsyncStatement {
  constructor(
    private client: Queryable,
    private sql: string,
    private name?: string
  ) {}

  all(params: Array<unknown>): Promise<Array<object>> {
    return this.client
      .query<object>({
        name: this.name,
        text: this.sql,
        values: params
      })
      .then(res => res.rows)
  }

  async run(params: Array<unknown>) {
    await this.client.query(
      {
        name: this.name,
        text: this.sql,
        values: params
      },
      params
    )
  }

  get(params: Array<unknown>): Promise<object> {
    return this.all(params).then(rows => rows[0] ?? null)
  }

  values(params: Array<unknown>): Promise<Array<Array<unknown>>> {
    return this.client
      .query({
        name: this.name,
        text: this.sql,
        values: params,
        rowMode: 'array'
      })
      .then(res => res.rows)
  }

  free() {}
}

export class PgDriver implements AsyncDriver {
  parsesJson = true

  constructor(
    private client: Queryable,
    private depth = 0
  ) {}

  async exec(query: string) {
    await this.client.query(query)
  }

  prepare(sql: string, options?: PrepareOptions): PreparedStatement {
    return new PreparedStatement(this.client, sql, options?.name)
  }

  async close(): Promise<void> {
    if ('end' in this.client) return this.client.end()
    if ('release' in this.client) return this.client.release()
  }

  async batch(queries: Array<BatchQuery>): Promise<Array<Array<unknown>>> {
    return this.transaction(async tx => {
      const results = []
      for (const {sql, params} of queries)
        results.push(await tx.prepare(sql).values(params))
      return results
    }, {})
  }

  async transaction<T>(
    run: (inner: AsyncDriver) => Promise<T>,
    options: TransactionOptions['postgres']
  ): Promise<T> {
    const client =
      'totalCount' in this.client ? await this.client.connect() : this.client
    try {
      await client.query(this.depth > 0 ? `savepoint d${this.depth}` : 'begin')
      const result = await run(new PgDriver(client, this.depth + 1))
      await client.query(
        this.depth > 0 ? `release savepoint d${this.depth}` : 'commit'
      )
      return result
    } catch (error) {
      await client.query(
        this.depth > 0 ? `rollback to savepoint d${this.depth}` : 'rollback'
      )
      throw error
    } finally {
      if ('release' in client) client.release()
    }
  }
}

export function connect(client: Queryable): AsyncDatabase<'postgres'> {
  return new AsyncDatabase(new PgDriver(client), postgresDialect, postgresDiff)
}
