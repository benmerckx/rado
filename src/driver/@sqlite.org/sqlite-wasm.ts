import type {
  DatabaseApi,
  PreparedStatement as SWPreparedStatement
} from '@sqlite.org/sqlite-wasm'
import {SchemaInstructions} from '../../define/Schema.js'
import {Driver, DriverOptions} from '../../lib/Driver.js'
import {Statement} from '../../lib/Statement.js'
import {SqliteFormatter} from '../../sqlite/SqliteFormatter.js'
import {SqliteSchema} from '../../sqlite/SqliteSchema.js'

class PreparedStatement implements Driver.Sync.PreparedStatement {
  constructor(
    private db: DatabaseApi,
    private stmt: SWPreparedStatement,
    private discardAfter: boolean
  ) {}

  *iterate<T>(params: Array<any>): IterableIterator<T> {
    this.stmt.bind(params)
    while (this.stmt.step()) yield this.stmt.get({})
    if (this.discardAfter) this.stmt.finalize()
  }

  all<T>(params: Array<any>): Array<T> {
    return Array.from(this.iterate(params))
  }

  run(params: Array<any>): {rowsAffected: number} {
    this.stmt.bind(params).step()
    if (this.discardAfter) this.stmt.finalize()
    return {rowsAffected: this.db.changes()}
  }

  get<T>(params: Array<any>): T {
    return this.all(params)[0] as T
  }

  execute(params: Array<any>): void {
    this.stmt.bind(params).step()
    if (this.discardAfter) this.stmt.finalize()
  }
}

export class SqliteWasmDriver extends Driver.Sync {
  tableData?: (tableName: string) => Array<SqliteSchema.Column>
  indexData?: (tableName: string) => Array<SqliteSchema.Index>

  constructor(public db: DatabaseApi, options?: DriverOptions) {
    super(new SqliteFormatter(), options)
  }

  close() {
    this.db.close()
  }

  prepareStatement(
    stmt: Statement,
    discardAfter: boolean
  ): Driver.Sync.PreparedStatement {
    return new PreparedStatement(
      this.db,
      this.db.prepare(stmt.sql),
      discardAfter
    )
  }

  schemaInstructions(tableName: string): SchemaInstructions | undefined {
    this.tableData =
      this.tableData || (this.tableData = this.prepare(SqliteSchema.tableData))
    this.indexData =
      this.indexData || (this.indexData = this.prepare(SqliteSchema.indexData))
    const columnData = this.tableData(tableName)
    const indexData = this.indexData(tableName)
    return SqliteSchema.createInstructions(columnData, indexData)
  }

  export(): Uint8Array {
    throw new Error('Not implemented')
  }
}

export function connect(db: DatabaseApi, options?: DriverOptions) {
  return new SqliteWasmDriver(db, options)
}
