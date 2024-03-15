import {Client} from 'pg'
import {SchemaInstructions} from '../define/Schema.js'
import {Driver, DriverOptions} from '../lib/Driver.js'
import {Statement} from '../lib/Statement.js'
import {PostgresFormatter} from '../postgres/PostgresFormatter.js'

class PreparedStatement implements Driver.Async.PreparedStatement {
  constructor(private db: Client, private stmt: Statement) {}

  async *iterate<T>(params: Array<any>): AsyncIterable<T> {
    const {default: Cursor} = await import('pg-cursor')
    const cursor = this.db.query(new Cursor(this.stmt.sql, params))
    try {
      while (true) {
        const result = await cursor.read(100)
        if (result.length === 0) break
        for (const row of result) yield row as T
      }
    } finally {
      await cursor.close()
    }
  }

  async all<T>(params: Array<any>): Promise<Array<T>> {
    const result = await this.db.query(this.stmt.sql, params)
    return result.rows
  }

  async run(params: Array<any>): Promise<{rowsAffected: number}> {
    const result = await this.db.query(this.stmt.sql, params)
    return {rowsAffected: result.rowCount}
  }

  async get<T>(params: Array<any>): Promise<T> {
    return (await this.all(params))[0] as T
  }

  async execute(params: Array<any>): Promise<void> {
    await this.db.query(this.stmt.sql, params)
  }
}

export class PgDriver extends Driver.Async {
  constructor(private db: Client, options?: DriverOptions) {
    super(new PostgresFormatter(), options)
  }

  prepareStatement(stmt: Statement): Driver.Async.PreparedStatement {
    return new PreparedStatement(this.db, stmt)
  }

  async schemaInstructions(
    tableName: string
  ): Promise<SchemaInstructions | undefined> {
    throw new Error(`Not implemented`)
  }

  async isolate(): Promise<
    [connection: Driver.Async, release: () => Promise<void>]
  > {
    throw new Error(`Not implemented`)
  }

  close(): Promise<void> {
    return this.db.end()
  }
}

export function connect(db: Client, options?: DriverOptions) {
  return new PgDriver(db, options)
}
