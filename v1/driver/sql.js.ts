import type {Database as SqlJsDatabase} from 'sql.js'
import {Database} from '../core/Database.ts'
import {SyncDriver, SyncStatement} from '../core/Driver.ts'
import {SqliteEmitter} from '../sqlite.ts'

class PreparedStatement implements SyncStatement {
  constructor(
    private db: SqlJsDatabase,
    private stmt: any,
    private freeAfter: boolean
  ) {}

  *iterate<T>(params: Array<any>): IterableIterator<T> {
    this.stmt.bind(params)
    while (this.stmt.step()) yield this.stmt.getAsObject()
    if (this.freeAfter) this.stmt.free()
    else this.stmt.reset()
  }

  all(params: Array<any>) {
    return Array.from(this.iterate(params))
  }

  run(params: Array<any>): {rowsAffected: number} {
    this.stmt.run(params)
    if (this.freeAfter) this.stmt.free()
    else this.stmt.reset()
    return {rowsAffected: this.db.getRowsModified()}
  }

  get(params: Array<any>) {
    return this.all(params)[0]
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
    return new PreparedStatement(this.db, this.db.prepare(sql), true)
  }
}

export function connect(db: SqlJsDatabase) {
  return new Database<'sync'>(new SqlJsDriver(db))
}
