import type {Database} from 'sql.js'
import {SchemaInstructions} from '../define/Schema.js'
import {Driver, DriverOptions} from '../lib/Driver.js'
import {Statement} from '../lib/Statement.js'
import {SqliteFormatter} from '../sqlite/SqliteFormatter.js'
import {SqliteSchema} from '../sqlite/SqliteSchema.js'

class PreparedStatement implements Driver.Sync.PreparedStatement {
  constructor(
    private db: Database,
    private stmt: any,
    private discardAfter: boolean
  ) {}

  *iterate<T>(params: Array<any>): IterableIterator<T> {
    this.stmt.bind(params)
    while (this.stmt.step()) yield this.stmt.getAsObject()
    if (this.discardAfter) this.stmt.free()
    else this.stmt.reset()
  }

  all<T>(params: Array<any>): Array<T> {
    return Array.from(this.iterate(params))
  }

  run(params: Array<any>): {rowsAffected: number} {
    this.stmt.run(params)
    if (this.discardAfter) this.stmt.free()
    else this.stmt.reset()
    return {rowsAffected: this.db.getRowsModified()}
  }

  get<T>(params: Array<any>): T {
    return this.all(params)[0] as T
  }

  execute(params: Array<any>): void {
    this.stmt.run(params)
    if (this.discardAfter) this.stmt.free()
    else this.stmt.reset()
  }
}

export class SqlJsDriver extends Driver.Sync {
  tableData?: (tableName: string) => Array<SqliteSchema.Column>
  indexData?: (tableName: string) => Array<SqliteSchema.Index>

  constructor(public db: Database, options?: DriverOptions) {
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
    return this.db.export()
  }
}

export function connect(db: Database, options?: DriverOptions) {
  return new SqlJsDriver(db, options)
}
