import type {Database, Statement as NativeStatement} from 'bun:sqlite'
import {QueryData, SelectFirst} from '../define/Query.js'
import type {SchemaInstructions} from '../define/Schema.js'
import {Driver, type DriverOptions} from '../lib/Driver.js'
import type {Statement} from '../lib/Statement.js'
import {SqliteFormatter} from '../sqlite/SqliteFormatter.js'
import {SqliteSchema} from '../sqlite/SqliteSchema.js'

class PreparedStatement implements Driver.Sync.PreparedStatement {
  constructor(
    private lastChanges: () => {rowsAffected: number},
    private stmt: NativeStatement
  ) {}

  *iterate<T>(params: Array<any>): IterableIterator<T> {
    for (const row of this.stmt.all(...params)) yield row
  }

  all<T>(params: Array<any>): Array<T> {
    return this.stmt.all(...params)
  }

  run(params: Array<any>): {rowsAffected: number} {
    this.stmt.run(...params)
    return this.lastChanges()
  }

  get<T>(params: Array<any>): T {
    return this.stmt.get(...params)
  }

  execute(params: Array<any>): void {
    this.stmt.run(...params)
  }
}

export class BunSqliteDriver extends Driver.Sync {
  tableData: (tableName: string) => Array<SqliteSchema.Column>
  indexData: (tableName: string) => Array<SqliteSchema.Index>
  lastChanges: () => {rowsAffected: number}

  constructor(
    public db: Database,
    options?: DriverOptions
  ) {
    super(new SqliteFormatter(), options)
    this.tableData = this.prepare(SqliteSchema.tableData)
    this.indexData = this.prepare(SqliteSchema.indexData)
    this.lastChanges = this.prepare(() => {
      return new SelectFirst<{rowsAffected: number}>(
        new QueryData.Raw({
          expectedReturn: 'row',
          strings: ['SELECT changes() as rowsAffected'],
          params: []
        }) as any
      )
    })
  }

  close() {
    this.db.close()
  }

  prepareStatement(stmt: Statement): Driver.Sync.PreparedStatement {
    return new PreparedStatement(this.lastChanges, this.db.prepare(stmt.sql))
  }

  schemaInstructions(tableName: string): SchemaInstructions | undefined {
    const columnData = this.tableData(tableName)
    const indexData = this.indexData(tableName)
    return SqliteSchema.createInstructions(columnData, indexData)
  }
}

export function connect(db: Database, options?: DriverOptions) {
  return new BunSqliteDriver(db, options)
}
