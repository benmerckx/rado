import type {
  Database as BunDatabase,
  Statement as NativeStatement
} from 'bun:sqlite'
import {Database} from '../core/Database.ts'
import {SyncDriver, SyncStatement} from '../core/Driver.ts'
import {SqliteEmitter} from '../sqlite.ts'

class PreparedStatement implements SyncStatement {
  constructor(private stmt: NativeStatement) {}

  all(params: Array<any>) {
    return this.stmt.all(...params)
  }

  run(params: Array<any>) {
    return this.stmt.run(...params)
  }

  get(params: Array<any>) {
    return this.stmt.get(...params)
  }
}

class BunSqliteDriver implements SyncDriver {
  emitter = new SqliteEmitter()

  constructor(public db: BunDatabase) {}

  exec(query: string): void {
    this.db.exec(query)
  }

  close() {
    this.db.close()
  }

  prepare(sql: string) {
    return new PreparedStatement(this.db.prepare(sql))
  }
}

export function connect(db: BunDatabase) {
  return new Database<'sync'>(new BunSqliteDriver(db))
}
