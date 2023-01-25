import type {Database, Statement as NativeStatement} from 'sqlite3'
import {Driver} from '../lib/Driver'
import {Query} from '../lib/Query'
import {SchemaInstructions} from '../lib/Schema'
import {CompiledStatement} from '../lib/Statement'
import {SqliteFormatter} from '../sqlite/SqliteFormatter'
import {SqliteSchema} from '../sqlite/SqliteSchema'

class PreparedStatement implements Driver.Async.PreparedStatement {
  constructor(private stmt: NativeStatement) {}

  async *iterate<T>(params?: any[] | undefined): AsyncIterable<T> {
    let rows: Array<T> = [],
      done = false,
      error: Error | undefined
    let resolve: () => void
    let promise = new Promise<void>(r => (resolve = r))
    this.stmt.each(
      params,
      (err, row) => {
        if (err) error = err
        else rows.push(row)
        resolve()
      },
      () => {
        done = true
        resolve()
      }
    )
    while (true) {
      const mustWait = !(rows.length || error || done)
      if (mustWait) await promise
      promise = new Promise<void>(r => (resolve = r))
      if (error) throw error
      if (rows.length) yield rows.shift()!
      if (done) return
    }
  }

  all<T>(params?: Array<any>): Promise<Array<T>> {
    return new Promise((resolve, reject) => {
      this.stmt.all(params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
  }

  run(params?: Array<any>): Promise<{rowsAffected: number}> {
    return new Promise((resolve, reject) => {
      this.stmt.run(params, function (err) {
        if (err) reject(err)
        else resolve({rowsAffected: this.changes})
      })
    })
  }

  get<T>(params?: Array<any>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.stmt.get(params, (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })
  }

  execute(params?: Array<any>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.stmt.run(params, err => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}

export class Sqlite3Driver extends Driver.Async {
  lock: Promise<void> | undefined
  tableData: (tableName: string) => Promise<Array<SqliteSchema.Column>>
  indexData: (tableName: string) => Promise<Array<SqliteSchema.Index>>

  constructor(private db: Database) {
    super(new SqliteFormatter())
    this.tableData = this.prepare(SqliteSchema.tableData)
    this.indexData = this.prepare(SqliteSchema.indexData)
  }

  async executeQuery<T>(
    query: Query<T>,
    stmt?: Driver.Async.PreparedStatement,
    params?: any[] | undefined
  ): Promise<T> {
    await this.lock
    return super.executeQuery(query, stmt, params)
  }

  prepareStatement(stmt: CompiledStatement): Driver.Async.PreparedStatement {
    return new PreparedStatement(this.db.prepare(stmt.sql))
  }

  async schemaInstructions(
    tableName: string
  ): Promise<SchemaInstructions | undefined> {
    const columnData = await this.tableData(tableName)
    const indexData = await this.indexData(tableName)
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
