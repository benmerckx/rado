import {QueryData} from '../define/Query.js'
import {SchemaInstructions} from '../define/Schema.js'
import {Driver, DriverOptions} from '../lib/Driver.js'
import {Statement} from '../lib/Statement.js'
import {SqliteFormatter} from '../sqlite/SqliteFormatter.js'
import {SqliteSchema} from '../sqlite/SqliteSchema.js'

class PreparedStatement implements Driver.Async.PreparedStatement {
  constructor(private stmt: D1PreparedStatement) {}

  async *iterate<T>(params: Array<any>): AsyncIterable<T> {
    yield* await this.all<T>(params)
  }

  async all<T>(params: Array<any>): Promise<Array<T>> {
    return this.stmt.bind(...params).raw()
  }

  async run(params: Array<any>): Promise<{rowsAffected: number}> {
    const results = await this.stmt.bind(...params).raw()
    return {
      get rowsAffected(): number {
        throw new Error(`Affected rows cannot be queried on D1`)
      }
    }
  }

  async get<T>(params: Array<any>): Promise<T> {
    return (await this.all(params))[0] as T
  }

  async execute(params: Array<any>): Promise<void> {
    this.stmt.bind(...params).raw()
  }
}

export class D1Driver extends Driver.Async {
  lock: Promise<void> | undefined
  tableData: (tableName: string) => Promise<Array<SqliteSchema.Column>>
  indexData: (tableName: string) => Promise<Array<SqliteSchema.Index>>

  constructor(private db: D1Database, options?: DriverOptions) {
    super(new SqliteFormatter(), options)
    this.tableData = this.prepare(SqliteSchema.tableData)
    this.indexData = this.prepare(SqliteSchema.indexData)
  }

  async executeQuery(
    query: QueryData,
    stmt?: Driver.Async.PreparedStatement,
    params?: any[] | undefined
  ): Promise<unknown> {
    await this.lock
    return super.executeQuery(query, stmt, params)
  }

  prepareStatement(stmt: Statement): Driver.Async.PreparedStatement {
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
    const connection = new D1Driver(this.db)
    let release!: () => Promise<void>,
      trigger = new Promise<void>(resolve => {
        release = async () => resolve()
      })
    this.lock = Promise.resolve(this.lock).then(() => trigger)
    return [connection, release]
  }

  async close(): Promise<void> {
    await this.lock
  }
}

export function connect(db: D1Database, options?: DriverOptions) {
  return new D1Driver(db, options)
}
