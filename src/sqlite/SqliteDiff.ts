import type {Database} from '../core/Database.ts'
import {
  getData,
  getTable,
  type HasSql,
  type HasTable
} from '../core/Internal.ts'
import {sql} from '../core/Sql.ts'
import {table} from '../core/Table.ts'
import {eq} from '../core/expr/Conditions.ts'
import type {Diff} from '../migrate/Diff.ts'
import * as column from './SqliteColumns.ts'

const ColumnInfo = table('Column', {
  cid: column.integer().notNull(),
  name: column.text().notNull(),
  type: column.text().notNull(),
  notnull: column.boolean().notNull(),
  dflt_value: column.text(),
  pk: column.boolean().notNull()
})

const IndexInfo = table('Index', {
  type: column.text().notNull(),
  name: column.text().notNull(),
  tbl_name: column.text().notNull(),
  rootpage: column.integer().notNull(),
  sql: column.text().notNull()
})

export class SqliteDiff implements Diff {
  #db: Database
  constructor(db: Database) {
    this.#db = db
  }

  async diffTable(table: HasTable): Promise<Array<string>> {
    const tableApi = getTable(table)
    const columnInfo = await this.columnInfo(tableApi.name)
    const indexInfo = await this.indexInfo(tableApi.name)
    const inline = (sql: HasSql) => this.#db.dialect.inline(sql)

    const localColumns = new Map(
      columnInfo.map(column => {
        return [
          column.name,
          inline(
            sql.chunk('emitColumn', {
              type: sql.unsafe(column.type.toLowerCase()),
              notNull: column.notnull,
              primary: column.pk,
              defaultValue:
                column.dflt_value !== null
                  ? () => sql.unsafe(column.dflt_value!)
                  : undefined
            })
          )
        ]
      })
    )
    console.log(localColumns)
    const schemaColumns = new Map(
      Object.entries(tableApi.columns).map(([name, column]) => {
        const columnApi = getData(column)
        return [
          columnApi.name ?? name,
          inline(sql.chunk('emitColumn', columnApi))
        ]
      })
    )
    console.log(schemaColumns)
    const localIndexes = new Map(
      indexInfo.map(index => [index.name, index.sql])
    )
    const schemaIndexes = new Map(
      Object.entries(tableApi.indexes()).map(([name, index]) => {
        const indexApi = getData(index)
        return [name, inline(indexApi.toSql(tableApi.name, name, false))]
      })
    )
    const stmts: Array<string> = []

    let recreate = false

    // Check if the columns are identical

    const columnNames = new Set([
      ...localColumns.keys(),
      ...schemaColumns.keys()
    ])

    for (const columnName of columnNames) {
      const localInstruction = localColumns.get(columnName)
      const schemaInstruction = schemaColumns.get(columnName)
      if (!schemaInstruction) {
        stmts.push(
          inline(
            sql`alter table ${sql.identifier(
              tableApi.name
            )} drop column ${sql.identifier(columnName)}`
          )
        )
      } else if (!localInstruction) {
        stmts.push(
          inline(
            sql`alter table ${sql.identifier(
              tableApi.name
            )} add column ${sql.unsafe(schemaInstruction!)}`
          )
        )
      } else if (localInstruction !== schemaInstruction) {
        recreate = true
        break
      }
    }

    // Check if the indexes are identical

    const indexNames = new Set([
      ...localIndexes.keys(),
      ...schemaIndexes.keys()
    ])

    for (const indexName of indexNames) {
      const localInstruction = localIndexes.get(indexName)
      const schemaInstruction = schemaIndexes.get(indexName)
      const dropLocal = inline(
        sql`drop index ${sql.identifier(indexName)} on ${sql.identifier(
          tableApi.name
        )}`
      )
      if (!schemaInstruction) {
        stmts.unshift(dropLocal)
      } else if (!localInstruction) {
        stmts.push(schemaInstruction)
      } else if (localInstruction !== schemaInstruction) {
        stmts.unshift(dropLocal)
        stmts.push(schemaInstruction)
      }
    }

    // Lastly check if the table definition is identical. If not then the
    // contraints, which we cannot easily check, are different.

    return stmts
  }

  async columnInfo(table: string) {
    return this.#db
      .select(ColumnInfo)
      .from(sql`pragma_table_info(${sql.inline(table)}) as "Column"`)
  }

  async indexInfo(table: string) {
    return this.#db
      .select(IndexInfo)
      .from(sql`sqlite_master as "Index"`)
      .where(eq(IndexInfo.tbl_name, table), eq(IndexInfo.type, 'index'))
  }
}
