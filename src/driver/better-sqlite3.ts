import type {Database} from 'better-sqlite3'
import {Connection} from '../Connection'
import {Cursor} from '../Cursor'
import {Query, QueryType} from '../Query'
import {SqliteFormatter} from '../sqlite/SqliteFormatter'

export function createConnection(db: Database): Connection.Sync {
  const formatter = new SqliteFormatter()
  function run<T>(query: Query<T>): T {
    const [sql, params] = formatter.compile(query)
    const stmt = db.prepare(sql)
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
  return <T>(cursor: Cursor<T>): T => {
    const query = cursor.query()
    switch (query.type) {
      case QueryType.Batch:
        let result
        const stmts = query.queries
        for (const query of stmts) result = run(query)
        return result as T
      default:
        return run(query)
    }
  }
}
