import type {Database} from 'sql.js'
import {Driver} from '../Driver'
import {SchemaInstructions} from '../Schema'
import {Statement} from '../Statement'
import {SqliteFormatter} from '../sqlite/SqliteFormatter'
import {SqliteSchema} from '../sqlite/SqliteSchema'

export class SqlJsDriver extends Driver.Sync {
  constructor(public db: Database) {
    super(new SqliteFormatter())
  }

  rows<T extends object = object>([sql, params]: Statement.Compiled): Array<T> {
    const stmt = this.db.prepare(sql)
    stmt.bind(params)
    const res = []
    while (stmt.step()) res.push(stmt.getAsObject())
    return res as Array<T>
  }

  values([sql, params]: Statement.Compiled): Array<Array<any>> {
    const stmt = this.db.prepare(sql)
    stmt.bind(params)
    const res = []
    while (stmt.step()) res.push(stmt.get())
    return res
  }

  execute([sql, params]: Statement.Compiled): void {
    this.db.prepare(sql).run(params)
  }

  mutate([sql, params]: Statement.Compiled): {rowsAffected: number} {
    this.db.prepare(sql).run(params)
    return {rowsAffected: this.db.getRowsModified()}
  }

  schemaInstructions(tableName: string): SchemaInstructions | undefined {
    try {
      const columnData: Array<SqliteSchema.Column> =
        this.rows<SqliteSchema.Column>(
          SqliteSchema.tableData(tableName).compile(this.formatter)
        )
      const indexData = this.rows<SqliteSchema.Index>(
        SqliteSchema.indexData(tableName).compile(this.formatter)
      )
      return SqliteSchema.createInstructions(columnData, indexData)
    } catch (e) {
      return undefined
    }
  }

  export(): Uint8Array {
    return this.db.export()
  }
}

export function connect(db: Database) {
  return new SqlJsDriver(db)
}
