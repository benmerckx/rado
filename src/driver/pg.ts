import pg, {type Client, type PoolClient} from 'pg'
import {AsyncDatabase, type TransactionOptions} from '../core/Database.ts'
import type {AsyncDriver, AsyncStatement, BatchQuery} from '../core/Driver.ts'
import {postgresDialect} from '../postgres/PostgresDialect.ts'

type Queryable = Client | pg.Pool | PoolClient

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

  get(params: Array<unknown>) {
    return this.all(params).then(rows => rows[0] ?? null)
  }

  values(params: Array<unknown>) {
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

  constructor(private client: Queryable) {}

  async exec(query: string) {
    await this.client.query(query)
  }

  prepare(sql: string, name: string) {
    return new PreparedStatement(this.client, sql, name)
  }

  async close(): Promise<void> {
    if ('end' in this.client) return this.client.end()
    if ('release' in this.client) return this.client.release()
  }

  async batch(queries: Array<BatchQuery>): Promise<Array<unknown>> {
    return this.transaction(
      async tx => {
        const results = []
        for (const {sql, params} of queries)
          results.push(await tx.prepare(sql).values(params))
        return results
      },
      {},
      0
    )
  }

  async transaction<T>(
    run: (inner: AsyncDriver) => Promise<T>,
    options: TransactionOptions['postgres'],
    depth: number
  ): Promise<T> {
    const client =
      this.client instanceof pg.Pool ? await this.client.connect() : this.client
    try {
      await client.query(depth > 0 ? `savepoint d${depth}` : 'begin')
      const result = await run(new PgDriver(client))
      await client.query(depth > 0 ? `release savepoint d${depth}` : 'commit')
      return result
    } catch (error) {
      await client.query(
        depth > 0 ? `rollback to savepoint d${depth}` : 'rollback'
      )
      throw error
    } finally {
      if ('release' in client) client.release()
    }
  }
}

export function connect(client: Queryable) {
  return new AsyncDatabase<'postgres'>(new PgDriver(client), postgresDialect)
}
