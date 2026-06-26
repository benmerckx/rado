import type {SQL} from 'bun'
import {AsyncDatabase, type TransactionOptions} from '../core/Database.ts'
import type {
  AsyncDriver,
  AsyncStatement,
  BatchedQuery,
  PrepareOptions
} from '../core/Driver.ts'
import {mysqlDialect} from '../mysql/dialect.ts'
import {mysqlDiff} from '../mysql/diff.ts'
import {setTransaction as setMysqlTransaction} from '../mysql/transactions.ts'
import {postgresDialect} from '../postgres/dialect.ts'
import {postgresDiff} from '../postgres/diff.ts'
import {setTransaction as setPostgresTransaction} from '../postgres/transactions.ts'
import {sqliteDialect} from '../sqlite.ts'
import {sqliteDiff} from '../sqlite/diff.ts'

class PreparedStatement implements AsyncStatement {
  constructor(
    private client: SQL,
    private sql: string
  ) {}

  all(params: Array<unknown>): Promise<Array<object>> {
    return this.client.unsafe(this.sql, params)
  }

  async run(params: Array<unknown>) {
    await this.client.unsafe(this.sql, params)
  }

  get(params: Array<unknown>): Promise<object> {
    return this.all(params).then(rows => rows[0] ?? null)
  }

  values(params: Array<unknown>): Promise<Array<Array<unknown>>> {
    return this.client.unsafe(this.sql, params).values()
  }

  free() {}
}

export class BunSqlDriver implements AsyncDriver {
  parsesJson = true
  supportsTransactions = true

  constructor(
    private client: SQL,
    private dialect: 'postgres' | 'mysql' | 'sqlite',
    private depth = 0
  ) {}

  async exec(query: string) {
    await this.client.unsafe(query)
  }

  prepare(sql: string, options?: PrepareOptions): PreparedStatement {
    return new PreparedStatement(this.client, sql)
  }

  async close(): Promise<void> {
    await this.client.close()
  }

  async batch(queries: Array<BatchedQuery>): Promise<Array<Array<unknown>>> {
    return this.transaction(async tx => {
      const results = []
      for (const {sql, params} of queries)
        results.push(await tx.prepare(sql).values(params))
      return results
    }, {})
  }

  async transaction<T>(
    run: (inner: AsyncDriver) => Promise<T>,
    options: TransactionOptions['postgres' | 'mysql' | 'sqlite']
  ): Promise<T> {
    if (this.depth > 0) {
      try {
        return await this.client.savepoint(async sp => {
          return await run(new BunSqlDriver(sp as any, this.dialect, this.depth + 1))
        }) as T
      } catch (error) {
        throw error
      }
    }
    return await this.client.begin(async tx => {
      if (this.dialect === 'postgres') {
        const setTx = setPostgresTransaction(options as TransactionOptions['postgres'])
        if (setTx) await tx.unsafe(setTx)
      } else if (this.dialect === 'mysql') {
        const setTx = setMysqlTransaction(options as TransactionOptions['mysql'])
        if (setTx) await tx.unsafe(setTx)
      }
      return await run(new BunSqlDriver(tx as any, this.dialect, this.depth + 1))
    }) as T
  }
}

export function connect(
  client: SQL,
  dialect: 'postgres' | 'mysql' | 'sqlite'
): AsyncDatabase<'postgres' | 'mysql' | 'sqlite'> {
  const driver = new BunSqlDriver(client, dialect)
  switch (dialect) {
    case 'postgres':
      return new AsyncDatabase(driver, postgresDialect, postgresDiff)
    case 'mysql':
      return new AsyncDatabase(driver, mysqlDialect, mysqlDiff)
    case 'sqlite':
      return new AsyncDatabase(driver, sqliteDialect, sqliteDiff)
  }
}
