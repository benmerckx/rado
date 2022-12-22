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
    const stmt = db.prepare(sql)
    switch (query.type) {
      case QueryType.Select:
        stmt.bind(params)
        const res = []
        while (stmt.step()) res.push(stmt.get()[0])
        return res as T
      default:
        stmt.run(params)
        return {rowsAffected: db.getRowsModified()} as T
    }
  }
}
