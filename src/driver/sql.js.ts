import type {Database} from 'sql.js'
import {Driver} from '../Driver'
import {Query} from '../Query'
import {SqliteFormatter} from '../sqlite/SqliteFormatter'

export class SqlJsDriver extends Driver.Sync {
  formatter = new SqliteFormatter()

  constructor(private db: Database) {
    super()
  }

  execute<T>(query: Query<T>): T {
    const [sql, params] = this.formatter.compile(query)
    const stmt = this.db.prepare(sql)
    if ('selection' in query) {
      stmt.bind(params)
      const res = []
      while (stmt.step()) {
        const row = stmt.get()[0] as string
        res.push(JSON.parse(row).result)
      }
      if (query.singleResult) return res[0] as T
      return res as T
    } else {
      stmt.run(params)
      return {rowsAffected: this.db.getRowsModified()} as T
    }
  }

  export(): Uint8Array {
    return this.db.export()
  }
}

export function connect(db: Database) {
  return new SqlJsDriver(db)
}
