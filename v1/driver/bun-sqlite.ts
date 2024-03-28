import type {Database as Client, Statement} from 'bun:sqlite'
import {SyncDatabase, type TransactionOptions} from '../core/Database.ts'
import type {SyncDriver, SyncStatement} from '../core/Driver.ts'
import {SqliteEmitter} from '../sqlite.ts'

class PreparedStatement implements SyncStatement {
  constructor(private stmt: Statement) {}

  all(params: Array<unknown>) {
    return this.stmt.all(...params)
  }

  run(params: Array<unknown>) {
    return this.stmt.run(...params)
  }

  get(params: Array<unknown>) {
    return this.stmt.get(...params)
  }

  values(params: Array<unknown>) {
    return this.stmt.values(...params)
  }

  free() {
    this.stmt.finalize()
  }
}

class BunSqliteDriver implements SyncDriver {
  emitter = new SqliteEmitter()

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

  transaction<T>(run: () => T, options: TransactionOptions['sqlite']): T {
    let result: T | undefined
    this.client
      .transaction(() => {
        result = run()
      })
      [options.behavior ?? 'deferred']()
    return result!
  }
}

export function connect(db: Client) {
  return new SyncDatabase<'sqlite'>(new BunSqliteDriver(db))
}
