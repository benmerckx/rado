import type {Database, Statement as NativeStatement} from 'better-sqlite3'
import {Driver} from '../lib/Driver'
import {SchemaInstructions} from '../lib/Schema'
import {Statement} from '../lib/Statement'
import {SqliteFormatter} from '../sqlite/SqliteFormatter'
import {SqliteSchema} from '../sqlite/SqliteSchema'

class PreparedStatement implements Driver.Sync.PreparedStatement {
  constructor(private stmt: NativeStatement) {}

  all<T>(params: Array<any> = []): Array<T> {
    return this.stmt.all(...params)
  }

  run(params: Array<any> = []): {rowsAffected: number} {
    return {rowsAffected: this.stmt.run(...params).changes}
  }

  get<T>(params: Array<any> = []): T {
    return this.stmt.get(...params)
  }

  execute(params: Array<any> = []): void {
    this.stmt.run(...params)
  }
}

export class BetterSqlite3Driver extends Driver.Sync {
  tableData: (tableName: string) => Array<SqliteSchema.Column>
  indexData: (tableName: string) => Array<SqliteSchema.Index>

  constructor(public db: Database) {
    super(new SqliteFormatter())
    this.tableData = this.prepare(SqliteSchema.tableData)
    this.indexData = this.prepare(SqliteSchema.indexData)
  }

  prepareStatement(stmt: Statement): Driver.Sync.PreparedStatement {
    return new PreparedStatement(this.db.prepare(stmt.sql))
  }

  schemaInstructions(tableName: string): SchemaInstructions | undefined {
    const columnData = this.tableData(tableName)
    const indexData = this.indexData(tableName)
    return SqliteSchema.createInstructions(columnData, indexData)
  }

  export(): Uint8Array {
    // This is missing from the type definitions
    // @ts-ignore
    return this.db.serialize()
  }
}

export function connect(db: Database) {
  return new BetterSqlite3Driver(db)
}
