import type {Client, InValue, Transaction} from '@libsql/client'
import {AsyncDatabase, type TransactionOptions} from '../core/Database.ts'
import type {
  AsyncDriver,
  AsyncStatement,
  BatchedQuery,
  PrepareOptions
} from '../core/Driver.ts'
import {sqliteDialect} from '../sqlite.ts'
import {sqliteDiff} from '../sqlite/diff.ts'

type Queryable = Client | Transaction

class PreparedStatement implements AsyncStatement {
  constructor(
    private client: Queryable,
    private sql: string
  ) {}

  async all(params: Array<InValue>): Promise<Array<object>> {
    const result = await this.client.execute({sql: this.sql, args: params})
    return result.rows
  }

  async run(params: Array<InValue>) {
    const result = await this.client.execute({sql: this.sql, args: params})
    // return {rowsAffected: result.rowsAffected}
  }

  async get(params: Array<InValue>): Promise<object | null> {
    return (await this.all(params))[0] ?? null
  }

  async values(params: Array<InValue>): Promise<Array<Array<unknown>>> {
    const result = await this.client.execute({sql: this.sql, args: params})
    return result.rows as any
  }

  free() {}
}

export class LibSQLClient implements AsyncDriver {
  parsesJson = false
  supportsTransactions = true

  constructor(
    private client: Queryable,
    private depth = 0
  ) {}

  async exec(query: string) {
    await this.client.execute(query)
  }

  prepare(sql: string, options: PrepareOptions): PreparedStatement {
    return new PreparedStatement(this.client, sql)
  }

  async close(): Promise<void> {
    if ('close' in this.client) return this.client.close()
  }

  async batch(queries: Array<BatchedQuery>): Promise<Array<Array<unknown>>> {
    const stmts = queries.map(({sql, params}) => {
      return {sql, args: params as Array<InValue>}
    })
    const rows = await this.client.batch(stmts)
    return rows.map(row => row.rows)
  }

  async transaction<T>(
    run: (inner: AsyncDriver) => Promise<T>,
    options: TransactionOptions['sqlite']
  ): Promise<T> {
    const client =
      'transaction' in this.client
        ? await this.client.transaction()
        : this.client
    const driver = new LibSQLClient(client, this.depth + 1)
    if (this.depth > 0) await client.execute(`savepoint d${this.depth}`)
    try {
      const result = await run(driver)
      if (this.depth > 0)
        await client.execute(`release savepoint d${this.depth}`)
      else await client.commit()
      return result
    } catch (error) {
      if (this.depth > 0)
        await client.execute(`rollback to savepoint d${this.depth}`)
      else await client.rollback()
      throw error
    } finally {
      if (this.depth === 0) client.close()
    }
  }
}

export function connect(client: Client): AsyncDatabase<'sqlite'> {
  return new AsyncDatabase(new LibSQLClient(client), sqliteDialect, sqliteDiff)
}
