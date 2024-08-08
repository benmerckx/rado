import type {Connection} from 'mysql2'
import type {
  Pool,
  PoolConnection,
  Connection as PromiseConnection
} from 'mysql2/promise'
import {AsyncDatabase, type TransactionOptions} from '../core/Database.ts'
import type {
  AsyncDriver,
  AsyncStatement,
  BatchQuery,
  PrepareOptions
} from '../core/Driver.ts'
import {mysqlDialect} from '../mysql/dialect.ts'
import {mysqlDiff} from '../mysql/diff.ts'
import {setTransaction, startTransaction} from '../mysql/transactions.ts'

type Queryable = PromiseConnection | Pool | PoolConnection

class PreparedStatement implements AsyncStatement {
  constructor(
    private client: Queryable,
    private sql: string,
    private name?: string
  ) {}

  all(params: Array<unknown>): Promise<Array<object>> {
    return this.client
      .query(this.sql, params)
      .then(res => res[0] as Array<object>)
  }

  async run(params: Array<unknown>) {
    await this.client.query(this.sql, params)
  }

  get(params: Array<unknown>): Promise<object> {
    return this.all(params).then(rows => rows[0] ?? null)
  }

  values(params: Array<unknown>): Promise<Array<Array<unknown>>> {
    return this.client
      .query({sql: this.sql, values: params, rowsAsArray: true})
      .then(res => res[0] as Array<Array<unknown>>)
  }

  free() {}
}

export class Mysql2Driver implements AsyncDriver {
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
  }

  async batch(queries: Array<BatchQuery>): Promise<Array<Array<unknown>>> {
    const transact = async (tx: AsyncDriver) => {
      const results = []
      for (const {sql, params} of queries)
        results.push(await tx.prepare(sql).values(params))
      return results
    }
    if (this.depth > 0) return transact(this)
    return this.transaction(transact, {})
  }

  async transaction<T>(
    run: (inner: AsyncDriver) => Promise<T>,
    options: TransactionOptions['mysql']
  ): Promise<T> {
    const client: Queryable = isPool(this.client)
      ? await this.client.getConnection()
      : this.client
    const driver = new Mysql2Driver(client, this.depth + 1)
    try {
      await client.query(
        this.depth > 0 ? `savepoint d${this.depth}` : startTransaction(options)
      )
      if (this.depth === 0) {
        const setOptions = setTransaction(options)
        if (setOptions) await client.query(setOptions)
      }
      const result = await run(driver)
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
      if (isPool(this.client))
        this.client.releaseConnection(client as PoolConnection)
    }
  }
}

function isPool(client: Queryable): client is Pool {
  return 'getConnection' in client
}

export function connect(
  client: Queryable | Connection
): AsyncDatabase<'mysql'> {
  return new AsyncDatabase(
    new Mysql2Driver('promise' in client ? client.promise() : client),
    mysqlDialect,
    mysqlDiff
  )
}
