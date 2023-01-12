import type {Database} from 'better-sqlite3'
import {Driver} from '../lib/Driver'
import {SchemaInstructions} from '../lib/Schema'
import {Statement} from '../lib/Statement'
import {SqliteFormatter} from '../sqlite/SqliteFormatter'
import {SqliteSchema} from '../sqlite/SqliteSchema'

export class BetterSqlite3Driver extends Driver.Sync {
  constructor(public db: Database) {
    super(new SqliteFormatter())
  }

  rows<T extends object = object>([sql, params]: Statement.Compiled): Array<T> {
    return this.db.prepare(sql).all(...params)
  }

  values([sql, params]: Statement.Compiled): Array<Array<any>> {
    return this.db
      .prepare(sql)
      .raw()
      .all(...params)
  }

  execute([sql, params]: Statement.Compiled): void {
    this.db.prepare(sql).run(...params)
  }

  mutate([sql, params]: Statement.Compiled): {rowsAffected: number} {
    const {changes} = this.db.prepare(sql).run(...params)
    return {rowsAffected: changes}
  }

  schemaInstructions(tableName: string): SchemaInstructions | undefined {
    const columnData: Array<SqliteSchema.Column> =
      this.rows<SqliteSchema.Column>(
        SqliteSchema.tableData(tableName).compile(this.formatter)
      )
    const indexData = this.rows<SqliteSchema.Index>(
      SqliteSchema.indexData(tableName).compile(this.formatter)
    )
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
