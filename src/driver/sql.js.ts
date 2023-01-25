import type {Database} from 'sql.js'
import {Driver} from '../lib/Driver'
import {SchemaInstructions} from '../lib/Schema'
import {Statement} from '../lib/Statement'
import {SqliteFormatter} from '../sqlite/SqliteFormatter'
import {SqliteSchema} from '../sqlite/SqliteSchema'

class PreparedStatement implements Driver.Sync.PreparedStatement {
  constructor(
    private db: Database,
    private stmt: any,
    private discardAfter: boolean
  ) {}

  all<T>(params?: Array<any>): Array<T> {
    this.stmt.bind(params)
    const res = []
    while (this.stmt.step()) res.push(this.stmt.getAsObject())
    if (this.discardAfter) this.stmt.free()
    return res
  }

  run(params?: Array<any>): {rowsAffected: number} {
    this.stmt.run(params)
    if (this.discardAfter) this.stmt.free()
    return {rowsAffected: this.db.getRowsModified()}
  }

  get<T>(params?: Array<any>): T {
    return this.all(params)[0] as T
  }

  execute(params?: Array<any>): void {
    this.stmt.run(params)
    if (this.discardAfter) this.stmt.free()
  }
}

export class SqlJsDriver extends Driver.Sync {
  tableData: (tableName: string) => Array<SqliteSchema.Column>
  indexData: (tableName: string) => Array<SqliteSchema.Index>

  constructor(public db: Database) {
    super(new SqliteFormatter())
    this.tableData = this.prepare(SqliteSchema.tableData)
    this.indexData = this.prepare(SqliteSchema.indexData)
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
    const columnData = this.tableData(tableName)
    const indexData = this.indexData(tableName)
    return SqliteSchema.createInstructions(columnData, indexData)
  }

  export(): Uint8Array {
    return this.db.export()
  }
}

export function connect(db: Database) {
  return new SqlJsDriver(db)
}
