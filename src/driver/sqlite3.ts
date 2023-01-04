import type {Database} from 'sqlite3'
import {Connection} from '../Connection'
import {Cursor} from '../Cursor'
import {Query, QueryType} from '../Query'
import {SqliteFormatter} from '../sqlite/SqliteFormatter'

export function createConnection(db: Database): Connection.Async {
  const formatter = new SqliteFormatter()
  function run<T>(query: Query<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const [sql, params] = formatter.compile(query)
      const stmt = db.prepare(sql)
      if ('selection' in query) {
        stmt.all(params, (err, rows) => {
          const res = rows.map(row => JSON.parse(row.result).result)
          if (err) reject(err)
          else resolve(query.singleResult ? res[0] : res)
        })
      } else {
        stmt.run(params, function (err) {
          if (err) reject(err)
          else resolve({rowsAffected: this.changes} as T)
        })
      }
    })
  }
  return async <T>(cursor: Cursor<T>): Promise<T> => {
    const query = cursor.query()
    switch (query.type) {
      case QueryType.Batch:
        let result
        const stmts = query.queries
        for (const query of stmts) result = await run(query)
        return result as T
      default:
        return run(query)
    }
  }
}
