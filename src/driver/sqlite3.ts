import type {Database} from 'sqlite3'
import {Driver} from '../lib/Driver'
import {Query} from '../lib/Query'
import {SchemaInstructions} from '../lib/Schema'
import {Statement} from '../lib/Statement'
import {SqliteFormatter} from '../sqlite/SqliteFormatter'
import {SqliteSchema} from '../sqlite/SqliteSchema'

export class Sqlite3Driver extends Driver.Async {
  lock: Promise<void> | undefined

  constructor(private db: Database) {
    super(new SqliteFormatter())
  }

  async executeQuery<T>(query: Query<T>): Promise<T> {
    await this.lock
    return super.executeQuery(query)
  }

  rows<T extends object = object>([sql, params]: Statement.Compiled): Promise<
    Array<T>
  > {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(sql)
      stmt.all(params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
  }

  async values(stmt: Statement.Compiled): Promise<Array<Array<any>>> {
    const rows = await this.rows(stmt)
    return rows.map(Object.values)
  }

  execute([sql, params]: Statement.Compiled): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const stmt = this.db.prepare(sql)
      stmt.run(params, err => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  mutate([sql, params]: Statement.Compiled): Promise<{rowsAffected: number}> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(sql)
      stmt.run(params, function (err) {
        if (err) reject(err)
        else resolve({rowsAffected: this.changes})
      })
    })
  }

  async schemaInstructions(
    tableName: string
  ): Promise<SchemaInstructions | undefined> {
    const columnData: Array<SqliteSchema.Column> =
      await this.rows<SqliteSchema.Column>(
        SqliteSchema.tableData(tableName).compile(this.formatter)
      )
    const indexData = await this.rows<SqliteSchema.Index>(
      SqliteSchema.indexData(tableName).compile(this.formatter)
    )
    return SqliteSchema.createInstructions(columnData, indexData)
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
