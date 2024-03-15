import {PGlite} from '@electric-sql/pglite'
import {SchemaInstructions} from '../../define/Schema.js'
import {Driver, DriverOptions} from '../../lib/Driver.js'
import {Statement} from '../../lib/Statement.js'
import {PostgresFormatter} from '../../postgres/PostgresFormatter.js'

class PreparedStatement implements Driver.Async.PreparedStatement {
  constructor(private db: PGlite, private stmt: Statement) {}

  async *iterate<T>(params?: any[] | undefined): AsyncIterable<T> {}

  async all<T>() {
    const sql = this.stmt.inlineParams()
    const res = await this.db.query(sql)
    return res as Promise<Array<T>>
  }

  run() {
    const sql = this.stmt.inlineParams()
    return this.db.query(sql) as Promise<{rowsAffected: number}>
  }

  async get<T>(): Promise<T> {
    const sql = this.stmt.inlineParams()
    const res: any = await this.db.query(sql)
    return res[0] as Promise<T>
  }

  execute() {
    const sql = this.stmt.inlineParams()
    return this.db.query(sql) as Promise<void>
  }
}

export class PGliteDriver extends Driver.Async {
  constructor(private db: PGlite, options?: DriverOptions) {
    super(new PostgresFormatter(), options)
  }

  prepareStatement(stmt: Statement): Driver.Async.PreparedStatement {
    return new PreparedStatement(this.db, stmt)
  }

  async schemaInstructions(
    tableName: string
  ): Promise<SchemaInstructions | undefined> {
    throw new Error('Not implemented')
  }

  async isolate(): Promise<
    [connection: Driver.Async, release: () => Promise<void>]
  > {
    throw new Error(`Not implemented`)
  }

  async close(): Promise<void> {
    await this.db.close()
  }
}

export function connect(db: PGlite, options?: DriverOptions) {
  return new PGliteDriver(db, options)
}
