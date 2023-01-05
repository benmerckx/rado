import type {Database} from 'better-sqlite3'
import {Driver} from '../Driver'
import {Query} from '../Query'
import {SqliteFormatter} from '../sqlite/SqliteFormatter'

class BetterSqlite3Driver extends Driver.Sync {
  formatter = new SqliteFormatter()

  constructor(private db: Database) {
    super()
  }

  execute<T>(query: Query<T>): T {
    const [sql, params] = this.formatter.compile(query)
    const stmt = this.db.prepare(sql)
    if ('selection' in query) {
      const res = stmt
        .pluck()
        .all(...params)
        .map(item => JSON.parse(item).result)
      if (query.singleResult) return res[0] as T
      return res as T
    } else {
      const {changes} = stmt.run(...params)
      return {rowsAffected: changes} as T
    }
  }
}

export function connect(db: Database) {
  return new BetterSqlite3Driver(db)
}
