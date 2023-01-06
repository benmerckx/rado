import type {Database} from 'sql.js'
import {Driver} from '../Driver'
import {Query, QueryType} from '../Query'
import {SqliteFormatter} from '../sqlite/SqliteFormatter'

export class SqlJsDriver extends Driver.Sync {
  formatter = new SqliteFormatter()

  constructor(private db: Database) {
    super()
  }

  execute(query: Query) {
    const [sql, params] = this.formatter.compile(query)
    const stmt = this.db.prepare(sql)
    if ('selection' in query) {
      stmt.bind(params)
      const res = []
      while (stmt.step()) {
        const row = stmt.get()[0] as string
        res.push(JSON.parse(row).result)
      }
      if (query.singleResult) return res[0]
      return res
    } else if (query.type === QueryType.Raw) {
      switch (query.expectedReturn) {
        case 'row':
          return stmt.getAsObject(params)
        case 'rows':
          stmt.bind(params)
          const res = []
          while (stmt.step()) res.push(stmt.getAsObject())
          return res
        default:
          stmt.run(params)
          return undefined
      }
    } else {
      stmt.run(params)
      return {rowsAffected: this.db.getRowsModified()}
    }
  }

  export(): Uint8Array {
    return this.db.export()
  }
}

export function connect(db: Database) {
  return new SqlJsDriver(db)
}
