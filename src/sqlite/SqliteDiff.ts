import {Rollback, type Database} from '../core/Database.ts'
import {getData, getQuery, getTable, type HasSql} from '../core/Internal.ts'
import {sql, type Sql} from '../core/Sql.ts'
import {table, type Table} from '../core/Table.ts'
import {eq} from '../core/expr/Conditions.ts'
import type {Diff} from '../migrate/Diff.ts'
import * as column from './SqliteColumns.ts'

const TableInfo = table('TableInfo', {
  cid: column.integer().notNull(),
  name: column.text().notNull(),
  type: column.text().notNull(),
  notnull: column.boolean().notNull(),
  dflt_value: column.text(),
  pk: column.integer().notNull()
})

const SqliteMaster = table('SqliteMaster', {
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

  async diffTable(hasTable: Table): Promise<Array<string>> {
    return this.#db.transaction(async tx => {
      const tableApi = getTable(hasTable)
      const columnInfo = await tx
        .select(TableInfo)
        .from(
          sql`pragma_table_info(${sql.inline(tableApi.name)}) as "TableInfo"`
        )
      const indexInfo = await tx
        .select(SqliteMaster)
        .from(sql`sqlite_master as "SqliteMaster"`)
        .where(
          eq(SqliteMaster.tbl_name, tableApi.name),
          eq(SqliteMaster.type, 'index')
        )
      const inline = (sql: HasSql) => this.#db.dialect.inline(sql)
      const hasSinglePrimaryKey =
        columnInfo.reduce((acc, column) => acc + column.pk, 0) === 1
      const localColumns = new Map(
        columnInfo.map(column => {
          return [
            column.name,
            inline(
              sql.chunk('emitColumn', {
                type: sql.unsafe(column.type.toLowerCase()),
                notNull: column.notnull,
                primary: hasSinglePrimaryKey && column.pk === 1,
                defaultValue:
                  column.dflt_value !== null
                    ? () => sql.unsafe(column.dflt_value!)
                    : undefined
              })
            )
          ]
        })
      )

      const schemaColumns = new Map(
        Object.entries(tableApi.columns).map(([name, column]) => {
          const columnApi = getData(column)
          return [
            columnApi.name ?? name,
            inline(sql.chunk('emitColumn', columnApi))
          ]
        })
      )

      const localIndexes = new Map(
        indexInfo.map(index => [index.name, index.sql])
      )
      const schemaIndexes = new Map(
        Object.entries(tableApi.indexes()).map(([name, index]) => {
          const indexApi = getData(index)
          return [name, inline(indexApi.toSql(tableApi.name, name, false))]
        })
      )
      const stmts: Array<Sql> = []

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
            sql.query({
              alterTable: sql.identifier(tableApi.name),
              dropColumn: sql.identifier(columnName)
            })
          )
        } else if (!localInstruction) {
          stmts.push(
            sql.query({
              alterTable: sql.identifier(tableApi.name),
              addColumn: [
                sql.identifier(columnName),
                sql.unsafe(schemaInstruction)
              ]
            })
          )
        } else if (localInstruction !== schemaInstruction) {
          return recreate()
        }
      }

      // Check if the table definition is identical after applying the
      // column changes, if not we might have different contraints

      try {
        await tx.transaction(async sp => {
          for (const stmt of stmts) await sp.execute(stmt)
          const tableInfo = await sp
            .select(SqliteMaster.sql)
            .from(sql`sqlite_master as "SqliteMaster"`)
            .where(
              eq(SqliteMaster.tbl_name, tableApi.name),
              eq(SqliteMaster.type, 'table')
            )
            .get()
          sp.rollback(tableInfo)
        })
      } catch (err) {
        if (!(err instanceof Rollback)) throw err
        const localInstruction = err.data as string
        const schemaInstruction = inline(tableApi.createTable())
        const stripStmt = (q: string) => q.slice('create table '.length)
        if (stripStmt(localInstruction) !== stripStmt(schemaInstruction)) {
          return recreate()
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
        const dropLocal = sql.query({
          dropIndex: sql.identifier(indexName),
          on: sql.identifier(tableApi.name)
        })
        if (!schemaInstruction) {
          stmts.unshift(dropLocal)
        } else if (!localInstruction) {
          stmts.push(sql.unsafe(schemaInstruction))
        } else if (localInstruction !== schemaInstruction) {
          stmts.unshift(dropLocal)
          stmts.push(sql.unsafe(schemaInstruction))
        }
      }

      return stmts.map(inline)

      function recreate() {
        const tempName = `new_${tableApi.name}`
        const tempTable = table(tempName, tableApi.columns)
        const missingColumns = Array.from(columnNames).filter(
          name => !localColumns.has(name)
        )
        const selection: Record<string, HasSql> = {...hasTable}
        for (const name of missingColumns) {
          selection[name] =
            getData(tableApi.columns[name]).defaultValue?.() ??
            sql.chunk('emitDefaultValue', undefined)
        }
        return [
          // Create a new temporary table with the new definition
          tableApi.createTable(tempName),

          // Copy the data from the old table to the new table
          getQuery(
            tx.insert(tempTable).select(tx.select(selection).from(hasTable))
          ),

          // Drop the old table
          sql.query({dropTable: sql.identifier(tableApi.name)}),

          // Rename the temporary table to the old table name
          sql.query({
            alterTable: sql.identifier(tempName),
            renameTo: sql.identifier(tableApi.name)
          }),

          // Create missing indexes
          ...tableApi.createIndexes()
        ].map(inline)
      }
    })
  }
}
