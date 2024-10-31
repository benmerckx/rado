import type {Diff} from '../core/Diff.ts'
import {type HasSql, getData, getTable} from '../core/Internal.ts'
import {schema} from '../core/Schema.ts'
import {type Sql, sql} from '../core/Sql.ts'
import type {Table} from '../core/Table.ts'
import {eq} from '../core/expr/Conditions.ts'
import {txGenerator} from '../universal.ts'
import * as column from './columns.ts'
import {mysqlDialect} from './dialect.ts'

const ns = schema('information_schema')
const Information = ns.table('columns', {
  table_name: column.text().notNull(),
  column_name: column.text().notNull(),
  column_type: column.text().notNull(),
  is_nullable: column.text().notNull(),
  column_default: column.text(),
  extra: column.text().notNull(),
  table_schema: column.text().notNull()
})

const inline = (sql: HasSql) => mysqlDialect.inline(sql)

export const mysqlDiff: Diff = (hasTable: Table) => {
  return txGenerator(function* (tx) {
    const tableApi = getTable(hasTable)

    // Fetch current table column information from MySQL information_schema
    const columnInfo = yield* tx
      .select({
        name: Information.column_name,
        type: Information.column_type,
        notNull: eq(Information.is_nullable, 'NO'),
        defaultValue: Information.column_default,
        extra: Information.extra
      })
      .from(Information)
      .where(
        eq(Information.table_name, tableApi.name),
        eq(Information.table_schema, sql.unsafe('DATABASE()'))
      )

    // Map existing columns from database
    const localColumns = new Map(
      columnInfo.map(column => {
        let type = column.type.toLowerCase()
        const isAutoIncrement = column.extra
          .toLowerCase()
          .includes('auto_increment')

        // Handle auto_increment columns
        if (isAutoIncrement) {
          if (type.includes('bigint')) type = 'bigserial'
          else if (type.includes('smallint')) type = 'smallserial'
          else type = 'serial'
        }

        return [
          column.name,
          {
            type: sql.unsafe(type),
            notNull: column.notNull && !isAutoIncrement,
            defaultValue:
              column.defaultValue && !isAutoIncrement
                ? sql.unsafe(column.defaultValue)
                : undefined
          }
        ]
      })
    )

    // Map schema columns from code
    const schemaColumns = new Map(
      Object.entries(tableApi.columns).map(([name, column]) => {
        const columnApi = getData(column)
        return [columnApi.name ?? name, columnApi]
      })
    )

    const stmts: Array<Sql> = []

    // Check if columns are identical
    const columnNames = new Set([
      ...localColumns.keys(),
      ...schemaColumns.keys()
    ])

    for (const columnName of columnNames) {
      const alterTable = sql.identifier(tableApi.name)
      const column = sql.identifier(columnName)
      const localInstruction = localColumns.get(columnName)
      const schemaInstruction = schemaColumns.get(columnName)

      if (!schemaInstruction) {
        // Drop column if it exists in database but not in schema
        stmts.push(
          sql.query({
            alterTable,
            dropColumn: column
          })
        )
      } else if (!localInstruction) {
        // Add column if it exists in schema but not in database
        stmts.push(
          sql.query({
            alterTable,
            addColumn: [column, sql.chunk('emitColumn', schemaInstruction)]
          })
        )
      } else {
        // Modify column if it exists in both but with different definitions
        if (inline(localInstruction.type) !== inline(schemaInstruction.type)) {
          stmts.push(
            sql.query({
              alterTable,
              modifyColumn: [column, schemaInstruction.type]
            })
          )
        }

        // Handle NOT NULL constraint changes
        if (
          Boolean(localInstruction.notNull) !==
          Boolean(schemaInstruction.notNull)
        ) {
          stmts.push(
            sql.query({
              alterTable,
              modifyColumn: [
                column,
                schemaInstruction.notNull
                  ? sql`${schemaInstruction.type} not null`
                  : sql`${schemaInstruction.type} null`
              ]
            })
          )
        }

        // Handle DEFAULT value changes
        const localDefault = localInstruction.defaultValue
        const schemaDefault = schemaInstruction.defaultValue
        const localDefaultStr = localDefault && inline(localDefault)
        const schemaDefaultStr = schemaDefault && inline(schemaDefault)

        if (localDefaultStr !== schemaDefaultStr) {
          stmts.push(
            sql.query({
              alterTable,
              alterColumn: [
                column,
                schemaDefault
                  ? sql`set default ${schemaDefault}`
                  : sql`drop default`
              ]
            })
          )
        }
      }
    }

    return stmts.map(inline)
  })
}
