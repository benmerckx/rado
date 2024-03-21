import type {BindParams, Database as SqlJsDatabase} from 'sql.js'
import {SyncDatabase} from '../core/Database.ts'
import type {SyncDriver, SyncStatement} from '../core/Driver.ts'
import {SqliteEmitter} from '../sqlite.ts'

class PreparedStatement implements SyncStatement {
  constructor(
    private db: SqlJsDatabase,
    private stmt: ReturnType<SqlJsDatabase['prepare']>
  ) {}

  *iterate<T>(params: Array<unknown>): IterableIterator<T> {
    this.stmt.bind(params as BindParams)
    while (this.stmt.step()) yield this.stmt.getAsObject() as T
    this.stmt.reset()
  }

  all(params: Array<unknown>) {
    return Array.from(this.iterate(params))
  }

  run(params: Array<unknown>): {rowsAffected: number} {
    this.stmt.run(params as BindParams)
    this.stmt.reset()
    return {rowsAffected: this.db.getRowsModified()}
  }

  get(params: Array<unknown>) {
    return this.all(params)[0]
  }

  free() {
    this.stmt.free()
  }
}

class SqlJsDriver implements SyncDriver {
  emitter = new SqliteEmitter()

  constructor(public db: SqlJsDatabase) {}

  exec(query: string): void {
    this.db.exec(query)
  }

  close() {
    this.db.close()
  }

  prepare(sql: string) {
    return new PreparedStatement(this.db, this.db.prepare(sql))
  }
}

export function connect(db: SqlJsDatabase) {
  return new SyncDatabase<'sqlite'>(new SqlJsDriver(db))
}
