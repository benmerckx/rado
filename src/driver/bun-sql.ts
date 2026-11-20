import type {SQL} from 'bun'
import {Batch} from '../core/Batch.ts'
import {
  AsyncDatabase,
  type DatabaseOptions,
  type TransactionOptions,
  type TransactionUniversalOptions
} from '../core/Database.ts'
import type {Dialect} from '../core/Dialect.ts'
import type {AsyncDriver, AsyncStatement, BatchedQuery} from '../core/Driver.ts'
import type {MutationResultBase} from '../core/MetaData.ts'
import {mysqlDialect} from '../mysql/dialect.ts'
import * as mysql from '../mysql/transactions.ts'
import {postgresDialect} from '../postgres/dialect.ts'
import * as postgres from '../postgres/transactions.ts'
import {sqliteDialect} from '../sqlite/dialect.ts'

type Adapter = 'postgres' | 'mysql' | 'sqlite'

interface Result extends Array<any> {
  count: number | null
  affectedRows: number | null
  lastInsertRowid: number | bigint | null
}

interface Queryable {
  unsafe(
    query: string,
    params?: Array<unknown>
  ): Promise<Result> & {
    values(): Promise<Result>
  }
  begin<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
  begin<T>(options: string, fn: (tx: Queryable) => Promise<T>): Promise<T>
  savepoint<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
}

const updates = /^\s*update\b/i

// Sent as text, scalars are typed by the server like pg does it
function untyped(param: unknown) {
  const type = typeof param
  if (type === 'number' || type === 'boolean' || type === 'bigint')
    return String(param)
  return param
}

class PreparedStatement implements AsyncStatement {
  constructor(
    private client: Queryable,
    private adapter: Adapter,
    private sql: string
  ) {}

  #query(params: Array<unknown>) {
    if (this.adapter === 'postgres') params = params.map(untyped)
    return this.client.unsafe(this.sql, params)
  }

  all(params: Array<unknown>): Promise<Array<object>> {
    return this.#query(params).then(rows => Array.from(rows))
  }

  async run(params: Array<unknown>): Promise<MutationResultBase> {
    const result = await this.#query(params)
    if (this.adapter === 'postgres') return {affectedRows: result.count ?? 0}
    const affectedRows = result.affectedRows ?? 0
    const insertId = result.lastInsertRowid ?? undefined
    if (this.adapter === 'sqlite') return {affectedRows, insertId}
    // Bun reports changed rows as affected, the update is all we can tell
    const changedRows = updates.test(this.sql) ? affectedRows : 0
    return {affectedRows, changedRows, insertId}
  }

  get(params: Array<unknown>): Promise<object | null> {
    return this.all(params).then(rows => rows[0] ?? null)
  }

  values(params: Array<unknown>): Promise<Array<Array<unknown>>> {
    return this.#query(params)
      .values()
      .then(rows => Array.from(rows))
  }

  free() {}
}

export class BunSqlDriver implements AsyncDriver {
  parsesJson: boolean
  supportsTransactions = true

  constructor(
    private client: Queryable,
    private adapter: Adapter,
    private depth = 0
  ) {
    this.parsesJson = adapter !== 'sqlite'
  }

  async exec(query: string) {
    await this.client.unsafe(query)
  }

  prepare(sql: string): PreparedStatement {
    return new PreparedStatement(this.client, this.adapter, sql)
  }

  async close(): Promise<void> {
    if (this.depth > 0) throw new Error('Cannot close a transaction')
    return this.client.close()
  }

  async batch(queries: Array<BatchedQuery>): Promise<Array<Array<unknown>>> {
    const transact = (tx: AsyncDriver) => Batch.run(tx, queries)
    if (this.depth > 0) return transact(this)
    return this.transaction(transact, {})
  }

  async transaction<T>(
    run: (inner: AsyncDriver) => Promise<T>,
    options: TransactionUniversalOptions
  ): Promise<T> {
    const inner = (tx: Queryable) =>
      run(new BunSqlDriver(tx, this.adapter, this.depth + 1))
    if (this.depth > 0) return this.client.savepoint(inner)
    switch (this.adapter) {
      case 'sqlite': {
        const {behavior = 'deferred'} = options as TransactionOptions['sqlite']
        return this.client.begin(behavior, inner)
      }
      case 'postgres':
        return this.client.begin(async tx => {
          const set = options as TransactionOptions['postgres']
          await tx.unsafe(postgres.setTransaction(set))
          return inner(tx)
        })
      case 'mysql':
        return this.client.begin(async tx => {
          const set = mysql.setTransaction(options)
          const start = mysql.startTransaction(options)
          // Bun always starts a plain transaction, restart it to apply the
          // options on the same connection
          if (set || start !== 'start transaction') {
            await tx.unsafe('commit')
            if (set) await tx.unsafe(set)
            await tx.unsafe(start)
          }
          return inner(tx)
        })
    }
  }
}

const dialects: Record<Adapter, Dialect> = {
  postgres: postgresDialect,
  mysql: mysqlDialect,
  sqlite: sqliteDialect
}

function adapterOf(client: SQL): Adapter {
  const {adapter = 'postgres'} = client.options
  return adapter === 'mariadb' ? 'mysql' : adapter
}

export function connect<Dialect extends Adapter = 'postgres'>(
  client: SQL,
  options?: DatabaseOptions
): AsyncDatabase<Dialect> {
  const adapter = adapterOf(client)
  // Prepared statements make Bun encode json parameters a second time
  if (adapter === 'postgres') client.options.prepare = false
  return new AsyncDatabase(
    new BunSqlDriver(client as unknown as Queryable, adapter),
    dialects[adapter],
    options
  )
}
