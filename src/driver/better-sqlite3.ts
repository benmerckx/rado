import type {Database as Client, Statement} from 'better-sqlite3'
import {SyncDatabase, type TransactionOptions} from '../core/Database.ts'
import type {BatchQuery, SyncDriver, SyncStatement} from '../core/Driver.ts'
import {sqliteDialect} from '../sqlite.ts'

class PreparedStatement implements SyncStatement {
  constructor(private stmt: Statement<Array<unknown>>) {}

  all(params: Array<unknown>) {
    return <Array<object>>this.stmt.raw(false).all(...params)
  }

  run(params: Array<unknown>) {
    return this.stmt.run(...params)
  }

  get(params: Array<unknown>) {
    return <object>this.stmt.raw(false).get(...params)
  }

  values(params: Array<unknown>) {
    return this.stmt.raw(true).all(...params)
  }

  free() {}
}

class BetterSqlite3Driver implements SyncDriver {
  constructor(public client: Client) {}

  exec(query: string): void {
    this.client.exec(query)
  }

  close() {
    this.client.close()
  }

  prepare(sql: string) {
    return new PreparedStatement(this.client.prepare(sql))
  }

  batch(queries: Array<BatchQuery>): Array<unknown> {
    return this.transaction(
      tx => queries.map(({sql, params}) => tx.prepare(sql).values(params)),
      {}
    )
  }

  transaction<T>(
    run: (inner: SyncDriver) => T,
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

export function connect(db: Client) {
  return new SyncDatabase<'sqlite'>(new BetterSqlite3Driver(db), sqliteDialect)
}
