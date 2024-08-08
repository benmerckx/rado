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

  constructor(private client: Client) {}

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
    run: (inner: BetterSqlite3Driver) => T,
    options: TransactionOptions['sqlite']
  ): T {
    let result: T | undefined
    this.client
      .transaction(() => {
        result = run(this)
      })
      [options.behavior ?? 'deferred']()
    return result!
  }
}

export function connect(db: Client): SyncDatabase<'sqlite'> {
  return new SyncDatabase(
    new BetterSqlite3Driver(db),
    sqliteDialect,
    sqliteDiff
  )
}
