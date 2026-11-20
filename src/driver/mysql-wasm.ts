import type {Database as Client, MySQL, Transaction} from 'mysql-wasm'
import {Batch} from '../core/Batch.ts'
import {
  AsyncDatabase,
  type DatabaseOptions,
  type TransactionOptions
} from '../core/Database.ts'
import type {AsyncDriver, AsyncStatement, BatchedQuery} from '../core/Driver.ts'
import type {MutationResultBase} from '../core/MetaData.ts'
import {mysqlDialect} from '../mysql/dialect.ts'
import {mysqlDiff} from '../mysql/diff.ts'
import {setTransaction, startTransaction} from '../mysql/transactions.ts'

type Queryable = Client | Transaction

class PreparedStatement implements AsyncStatement {
  constructor(
    private client: Queryable,
    private sql: string
  ) {}

  #query(params: Array<unknown>, rowMode: 'object' | 'array') {
    return this.client.query<any>(this.sql, params as Array<any>, {rowMode})
  }

  all(params: Array<unknown>): Promise<Array<object>> {
    return this.#query(params, 'object').then(res => res.rows)
  }

  async run(params: Array<unknown>): Promise<MutationResultBase> {
    const {affectedRows, changedRows, insertId} = await this.#query(
      params,
      'array'
    )
    return {affectedRows, changedRows, insertId: Number(insertId)}
  }

  get(params: Array<unknown>): Promise<object> {
    return this.all(params).then(rows => rows[0] ?? null)
  }

  values(params: Array<unknown>): Promise<Array<Array<unknown>>> {
    return this.#query(params, 'array').then(res => res.rows)
  }

  free() {}
}

export class MysqlWasmDriver implements AsyncDriver {
  parsesJson = true
  supportsTransactions = true

  constructor(
    private client: Queryable,
    private depth = 0
  ) {}

  async exec(query: string) {
    await this.client.exec(query)
  }

  prepare(sql: string): PreparedStatement {
    return new PreparedStatement(this.client, sql)
  }

  async close(): Promise<void> {
    if ('close' in this.client) return this.client.close()
    throw new Error('Cannot close a transaction')
  }

  async batch(queries: Array<BatchedQuery>): Promise<Array<Array<unknown>>> {
    const transact = (tx: AsyncDriver) => Batch.run(tx, queries)
    if (this.depth > 0) return transact(this)
    return this.transaction(transact, {})
  }

  async transaction<T>(
    run: (inner: AsyncDriver) => Promise<T>,
    options: TransactionOptions['mysql']
  ): Promise<T> {
    if (this.depth === 0 && 'transaction' in this.client)
      return this.client.transaction(async tx => {
        const set = setTransaction(options)
        const start = startTransaction(options)
        // The client always starts a plain transaction, restart it to apply
        // the options while still holding its lock on the session
        if (set || start !== 'start transaction') {
          await tx.query('commit')
          if (set) await tx.query(set)
          await tx.query(start)
        }
        return run(new MysqlWasmDriver(tx, 1))
      })
    await this.exec(`savepoint d${this.depth}`)
    try {
      const result = await run(new MysqlWasmDriver(this.client, this.depth + 1))
      await this.exec(`release savepoint d${this.depth}`)
      return result
    } catch (error) {
      try {
        await this.exec(`rollback to savepoint d${this.depth}`)
      } catch {}
      throw error
    }
  }
}

export function connect(
  db: MySQL | Client,
  options?: DatabaseOptions
): AsyncDatabase<'mysql'> {
  return new AsyncDatabase(
    new MysqlWasmDriver(db),
    mysqlDialect,
    mysqlDiff,
    options
  )
}
