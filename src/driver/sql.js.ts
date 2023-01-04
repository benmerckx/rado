import type {Database} from 'sql.js'
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
      return {rowsAffected: db.getRowsModified()} as T
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
