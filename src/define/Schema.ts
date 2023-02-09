import {Formatter} from '../lib/Formatter'
import {Statement} from '../lib/Statement'
import {Expr, ExprData} from './Expr'
import {Query, QueryType} from './Query'
import {TableData} from './Table'
import {Target} from './Target'

export interface SchemaInstructions {
  columns: Record<string, string>
  indexes: Record<string, string>
}

export namespace Schema {
  export function create(schema: TableData) {
    const queries = []
    queries.push(Query.CreateTable({table: schema, ifNotExists: true}))
    const meta = schema.meta()
    if (meta.indexes)
      for (const index of Object.values(meta.indexes))
        queries.push(
          Query.CreateIndex({table: schema, index, ifNotExists: true})
        )
    return Query.Batch({queries})
  }

  function removeLeadingWhitespace(str: string) {
    return str.replace(/\n\s+/g, '\n')
  }

  // This is placed here but is SQLite specific, so we'll eventually move it
  function recreateTable(
    table: TableData,
    addedColumns: Set<string>
  ): Array<Query> {
    const queries: Array<Query> = []

    queries.push(
      Query.Raw({strings: ['PRAGMA foreign_keys = OFF'], params: []})
    )

    // Create a new temporary table with the new definition
    const tempTable = {...table, name: `$$new_${table.name}`}
    queries.push(Query.CreateTable({table: tempTable}))

    // Copy the data from the old table to the new table
    queries.push(
      Query.Insert({
        into: tempTable,
        select: Query.Select({
          from: Target.Table(table),
          selection: ExprData.Record(
            Object.fromEntries(
              Object.entries(table.columns).map(([key, column]) => [
                key,
                addedColumns.has(key)
                  ? (typeof column.defaultValue === 'function'
                      ? column.defaultValue()
                      : column.defaultValue) || Expr.NULL.expr
                  : ExprData.Field(ExprData.Row(Target.Table(table)), key)
              ])
            )
          )
        })
      })
    )

    // Drop the old table
    queries.push(Query.DropTable({table, ifExists: true}))

    // Rename the temporary table to the old table name
    queries.push(
      Query.AlterTable({
        table: table,
        renameTable: {from: tempTable.name}
      })
    )

    // Create missing indexes
    for (const index of Object.values(table.meta().indexes))
      queries.push(Query.CreateIndex({table, index}))

    queries.push(Query.Raw({strings: ['PRAGMA foreign_keys = ON'], params: []}))

    return queries
  }

  export function upgrade(
    formatter: Formatter,
    local: SchemaInstructions,
    schema: TableData
  ): Array<Query> {
    const columnNames = new Set([
      ...Object.keys(local.columns),
      ...Object.keys(schema.columns)
    ])
    const res: Array<Query> = []
    let recreate = false
    for (const columnName of columnNames) {
      const localInstruction = local.columns[columnName]
      const schemaCol = schema.columns[columnName]
      if (!localInstruction) {
        res.push(Query.AlterTable({table: schema, addColumn: schemaCol}))
      } else if (!schemaCol) {
        res.push(Query.AlterTable({table: schema, dropColumn: columnName}))
      } else {
        const {sql: instruction} = formatter.formatColumn(
          {stmt: new Statement(formatter)},
          {...schemaCol, references: undefined}
        )
        if (
          removeLeadingWhitespace(localInstruction) !==
          removeLeadingWhitespace(instruction)
        ) {
          recreate = true
        }
      }
    }

    // Indexes will be dropped and created again
    if (recreate) {
      const added = res
        .filter(
          (query): query is Query.AlterTable =>
            query.type === QueryType.AlterTable && Boolean(query.addColumn)
        )
        .map(query => query.addColumn!.name)
      return recreateTable(schema, new Set(added))
    }

    const meta = schema.meta()
    const indexNames = new Set([
      ...Object.keys(local.indexes),
      ...Object.keys(meta.indexes)
    ])
    for (const indexName of indexNames) {
      const localInstruction = local.indexes[indexName]
      const schemaIndex = meta.indexes[indexName]
      if (!localInstruction) {
        res.push(Query.CreateIndex({table: schema, index: schemaIndex}))
      } else if (!schemaIndex) {
        res.unshift(Query.DropIndex({table: schema, name: indexName}))
      } else {
        const {sql: instruction} = formatter.compile(
          Query.CreateIndex({table: schema, index: schemaIndex})
        )
        if (
          removeLeadingWhitespace(localInstruction) !==
          removeLeadingWhitespace(instruction)
        ) {
          res.unshift(Query.DropIndex({table: schema, name: indexName}))
          res.push(Query.CreateIndex({table: schema, index: schemaIndex}))
        }
      }
    }
    return res
  }
}
