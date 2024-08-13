import type {Database as Client, Statement} from 'better-sqlite3'
import {SyncDatabase, type TransactionOptions} from '../core/Database.ts'
import type {
  BatchQuery,
  PrepareOptions,
  SyncDriver,
  SyncStatement
} from '../core/Driver.ts'
import {sqliteDialect} from '../sqlite.ts'
import {sqliteDiff} from '../sqlite/diff.ts'
import {execTransaction} from '../sqlite/transactions.ts'

class PreparedStatement implements SyncStatement {
  constructor(
    private stmt: Statement<Array<unknown>>,
    private isSelection: boolean
  ) {}

  all(params: Array<unknown>) {
    return <Array<object>>this.stmt.all(...params)
  }

  run(params: Array<unknown>) {
    return this.stmt.run(...params)
  }

  get(params: Array<unknown>) {
    return <object>this.stmt.get(...params)
  }

  values(params: Array<unknown>) {
    if (this.isSelection) return this.stmt.raw(true).all(...params)
    this.stmt.run(...params)
    return []
  }

  free() {}
}

class BetterSqlite3Driver implements SyncDriver {
  parsesJson = false

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

  batch(queries: Array<BatchQuery>): Array<Array<unknown>> {
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
      depth => new BetterSqlite3Driver(this.client, depth),
      run,
      options
    )
  }
}

export function connect(db: Client): SyncDatabase<'sqlite'> {
  return new SyncDatabase(
    new BetterSqlite3Driver(db),
    sqliteDialect,
    sqliteDiff
  )
}
