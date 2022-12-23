import type {Database} from 'better-sqlite3'
import {Connection} from '../Connection'
import {Cursor} from '../Cursor'
import {QueryType} from '../Query'
import {SqliteFormatter} from '../sqlite/SqliteFormatter'

export function createConnection(db: Database): Connection.Sync {
  const formatter = new SqliteFormatter()
  return <T>(cursor: Cursor<T>): T => {
    const query = cursor.query()
    if (query.type === QueryType.Batch) {
      const stmts = query.queries
        .map(q => formatter.compile(q, true)[0])
        .map(sql => db.prepare(sql))
      for (const stmt of stmts) stmt.run()
      return undefined as T
    }
    const [sql, params] = formatter.compile(query)
    const stmt = db.prepare(sql)
    switch (query.type) {
      case QueryType.Select:
        const res = stmt
          .pluck()
          .all(...params)
          .map(item => JSON.parse(item).result)
        if (query.singleResult) return res[0] as T
        return res as T
      default:
        const {changes} = stmt.run(...params)
        return {rowsAffected: changes} as T
    }
  }
}
