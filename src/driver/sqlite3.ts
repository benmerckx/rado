import type {Database} from 'sqlite3'
import {Driver} from '../Driver'
import {Query, QueryType} from '../Query'
import {SqliteFormatter} from '../sqlite/SqliteFormatter'

export class Sqlite3Driver extends Driver.Async {
  formatter = new SqliteFormatter()
  lock: Promise<void> | undefined

  constructor(private db: Database) {
    super()
  }

  async execute(query: Query) {
    await this.lock
    return new Promise((resolve, reject) => {
      const [sql, params] = this.formatter.compile(query)
      const stmt = this.db.prepare(sql)
      if ('selection' in query) {
        stmt.all(params, (err, rows) => {
          const res = rows.map(row => JSON.parse(row.result).result)
          if (err) reject(err)
          else resolve(query.singleResult ? res[0] : res)
        })
      } else if (query.type === QueryType.Raw) {
        switch (query.expectedReturn) {
          case 'row':
            return stmt.get(params, (err, row) => {
              if (err) reject(err)
              else resolve(row)
            })
          case 'rows':
            return stmt.all(params, (err, rows) => {
              if (err) reject(err)
              else resolve(rows)
            })
          default:
            stmt.run(params, err => {
              if (err) reject(err)
              else resolve(undefined)
            })
            return undefined
        }
      } else {
        stmt.run(params, function (err) {
          if (err) reject(err)
          else resolve({rowsAffected: this.changes})
        })
      }
    })
  }

  isolate(): [connection: Driver.Async, release: () => Promise<void>] {
    const connection = new Sqlite3Driver(this.db)
    let release!: () => Promise<void>,
      trigger = new Promise<void>(resolve => {
        release = async () => resolve()
      })
    this.lock = Promise.resolve(this.lock).then(() => trigger)
    return [connection, release]
  }
}

export function connect(db: Database) {
  return new Sqlite3Driver(db)
}
