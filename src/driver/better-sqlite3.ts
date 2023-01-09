import type {Database} from 'better-sqlite3'
import {Driver} from '../Driver'
import {Schema} from '../Schema'
import {Statement} from '../Statement'
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

  schema(tableName: string): Schema {
    const columns: Array<SqliteSchema.Column> = this.rows<SqliteSchema.Column>(
      SqliteSchema.tableData(tableName).compile(this.formatter)
    )
    return {
      name: tableName,
      columns: Object.fromEntries(columns.map(SqliteSchema.parseColumn))
    }
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
