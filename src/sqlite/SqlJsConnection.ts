import type {Database} from 'sql.js'
import {Connection} from '../Connection'
import {Cursor} from '../Cursor'
import {QueryType} from '../Query'
import {SqliteFormatter} from './SqliteFormatter'

export function createSqlJsConnection(db: Database): Connection.Sync {
  const formatter = new SqliteFormatter()
  return <T>(cursor: Cursor<T>): T => {
    const query = cursor.query()
    const [sql, params] = formatter.compile(query)
    console.log(sql)
    const stmt = db.prepare(sql)
    switch (query.type) {
      case QueryType.Select:
        stmt.bind(params)
        const res = []
        while (stmt.step()) {
          const row = stmt.get()[0] as string
          res.push(JSON.parse(row).result)
        }
        if (query.singleResult) return res[0] as T
        return res as T
      default:
        stmt.run(params)
        return {rowsAffected: db.getRowsModified()} as T
    }
  }
}
