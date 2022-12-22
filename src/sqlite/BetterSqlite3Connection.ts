import type {Database} from 'better-sqlite3'
import {Connection} from '../Connection'
import {Cursor} from '../Cursor'
import {QueryType} from '../Query'
import {SqliteFormatter} from './SqliteFormatter'

export function createBetterSqlite3Connection(db: Database): Connection.Sync {
  const formatter = new SqliteFormatter()
  return <T>({query}: Cursor<T>): T => {
    const [sql, params] = formatter.compile(query)
    const stmt = db.prepare(sql)
    switch (query.type) {
      case QueryType.Select:
        return stmt.all(...params) as T
      default:
        const {changes} = stmt.run(...params)
        return {rowsAffected: changes} as T
    }
  }
}
