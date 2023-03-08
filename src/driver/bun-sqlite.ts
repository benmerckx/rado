import type {Database, Statement as NativeStatement} from 'bun:sqlite'
import {QueryData} from '../define/Query.js'
import {SchemaInstructions} from '../define/Schema.js'
import {SelectFirst} from '../define/query/Select.js'
import {Driver} from '../lib/Driver.js'
import {SqlError} from '../lib/SqlError.js'
import {Statement} from '../lib/Statement.js'
import {SqliteFormatter} from '../sqlite/SqliteFormatter.js'
import {SqliteSchema} from '../sqlite/SqliteSchema.js'

class PreparedStatement implements Driver.Sync.PreparedStatement {
  constructor(
    private lastChanges: () => {rowsAffected: number},
    private stmt: NativeStatement
  ) {}

  *iterate<T>(params: Array<any> = []): IterableIterator<T> {
    for (const row of this.stmt.all(...params)) yield row
  }

  all<T>(params: Array<any> = []): Array<T> {
    return this.stmt.all(...params)
  }

  run(params: Array<any> = []): {rowsAffected: number} {
    this.stmt.run(...params)
    return this.lastChanges()
  }

  get<T>(params: Array<any> = []): T {
    return this.stmt.get(...params)
  }

  execute(params: Array<any> = []): void {
    this.stmt.run(...params)
  }
}

export class BunSqliteDriver extends Driver.Sync {
  tableData: (tableName: string) => Array<SqliteSchema.Column>
  indexData: (tableName: string) => Array<SqliteSchema.Index>
  lastChanges: () => {rowsAffected: number}

  constructor(public db: Database) {
    super(new SqliteFormatter())
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

  prepareStatement(stmt: Statement): Driver.Sync.PreparedStatement {
    try {
      return new PreparedStatement(this.lastChanges, this.db.prepare(stmt.sql))
    } catch (e: any) {
      throw new SqlError(e, stmt.sql)
    }
  }

  schemaInstructions(tableName: string): SchemaInstructions | undefined {
    const columnData = this.tableData(tableName)
    const indexData = this.indexData(tableName)
    return SqliteSchema.createInstructions(columnData, indexData)
  }
}

export function connect(db: Database) {
  return new BunSqliteDriver(db)
}
