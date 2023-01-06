import type {Database} from 'better-sqlite3'
import {Driver} from '../Driver'
import {Query, QueryType} from '../Query'
import {SqliteFormatter} from '../sqlite/SqliteFormatter'

export class BetterSqlite3Driver extends Driver.Sync {
  formatter = new SqliteFormatter()

  constructor(private db: Database) {
    super()
  }

  execute(query: Query) {
    const [sql, params] = this.formatter.compile(query)
    const stmt = this.db.prepare(sql)
    if ('selection' in query) {
      const res = stmt
        .pluck()
        .all(...params)
        .map(item => JSON.parse(item).result)
      if (query.singleResult) return res[0]
      return res
    } else if (query.type === QueryType.Raw) {
      switch (query.expectedReturn) {
        case 'row':
          return stmt.get(...params)
        case 'rows':
          return stmt.all(...params)
        default:
          stmt.run(...params)
          return undefined
      }
    } else {
      const {changes} = stmt.run(...params)
      return {rowsAffected: changes}
    }
  }

  export(): Uint8Array {
    // This is missing from the type definitions
    // @ts-ignore
    return this.db.serialize()
  }
}

export function connect(db: Database) {
  return new BetterSqlite3Driver(db)
}
