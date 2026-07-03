import {SyncDatabase, type TransactionOptions} from '../core/Database.ts'
import type {
  BatchedQuery,
  PrepareOptions,
  SyncDriver,
  SyncStatement
} from '../core/Driver.ts'
import {sqliteDialect} from '../sqlite.ts'
import {sqliteDiff} from '../sqlite/diff.ts'
import {execTransaction} from '../sqlite/transactions.ts'

interface Client {
  close(): void
  exec(query: string): void
  prepare(sql: string): Statement
}

interface Statement {
  all(...params: Array<unknown>): Array<object>
  run(...params: Array<unknown>): unknown
  get(...params: Array<unknown>): object | null
  setReturnArrays(value: boolean): void
}

class PreparedStatement implements SyncStatement {
  constructor(
    private stmt: Statement,
    private isSelection: boolean
  ) {}

  all(params: Array<unknown>) {
    return this.stmt.all(...params)
  }

  run(params: Array<unknown>) {
    this.stmt.run(...params)
  }

  get(params: Array<unknown>) {
    return this.stmt.get(...params)
  }

  values(params: Array<unknown>) {
    if (!this.isSelection) {
      this.stmt.run(...params)
      return []
    }
    this.stmt.setReturnArrays(true)
    try {
      return this.stmt.all(...params) as Array<Array<unknown>>
    } finally {
      this.stmt.setReturnArrays(false)
    }
  }

  free() {}
}

class NodeSqliteDriver implements SyncDriver {
  parsesJson = false
  supportsTransactions = true

  constructor(
    private client: Client,
    private depth = 0
  ) {}

  exec(query: string): void {
    this.client.exec(query)
  }

  close() {
    this.client.close()
  }

  prepare(sql: string, options: PrepareOptions) {
    return new PreparedStatement(this.client.prepare(sql), options.isSelection)
  }

  batch(queries: Array<BatchedQuery>): Array<Array<unknown>> {
    return this.transaction(
      tx =>
        queries.map(({sql, params, isSelection}) =>
          tx.prepare(sql, {isSelection}).values(params)
        ),
      {}
    )
  }

  transaction<T>(
    run: (inner: SyncDriver) => T,
    options: TransactionOptions['sqlite']
  ): T {
    return execTransaction(
      this,
      this.depth,
      depth => new NodeSqliteDriver(this.client, depth),
      run,
      options
    )
  }
}

export function connect(db: Client): SyncDatabase<'sqlite'> {
  return new SyncDatabase(new NodeSqliteDriver(db), sqliteDialect, sqliteDiff)
}
