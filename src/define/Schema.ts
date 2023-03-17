import {Formatter} from '../lib/Formatter.js'
import {Statement} from '../lib/Statement.js'
import {Expr, ExprData} from './Expr.js'
import {QueryData, QueryType} from './Query.js'
import {Table, TableData} from './Table.js'
import {Target} from './Target.js'

export interface SchemaInstructions {
  columns: Record<string, string>
  indexes: Record<string, string>
}

export namespace Schema {
  export function create(schema: TableData) {
    const queries = []
    queries.push(new QueryData.CreateTable({table: schema, ifNotExists: true}))
    const meta = schema.meta()
    if (meta.indexes)
      for (const index of Object.values(meta.indexes))
        queries.push(
          new QueryData.CreateIndex({table: schema, index, ifNotExists: true})
        )
    return new QueryData.Batch({queries})
  }

  function removeLeadingWhitespace(str: string) {
    return str.replace(/\n\s+/g, '\n')
  }

  // This is placed here but is SQLite specific, so we'll eventually move it
  function recreateTable(
    table: TableData,
    addedColumns: Set<string>
  ): Array<QueryData> {
    const queries: Array<QueryData> = []

    // Create a new temporary table with the new definition
    const tempTable = {...table, name: `$$new_${table.name}`}
    queries.push(new QueryData.CreateTable({table: tempTable}))

    // Copy the data from the old table to the new table
    queries.push(
      new QueryData.Insert({
        into: tempTable,
        select: new QueryData.Select({
          from: new Target.Table(table),
          selection: new ExprData.Record(
            Object.fromEntries(
              Object.entries(table.columns).map(([key, column]) => [
                key,
                addedColumns.has(key)
                  ? (typeof column.defaultValue === 'function'
                      ? column.defaultValue()
                      : column.defaultValue) || Expr.NULL[Expr.Data]
                  : new ExprData.Field(
                      new ExprData.Row(new Target.Table(table)),
                      key
                    )
              ])
            )
          )
        })
      })
    )

    // Drop the old table
    queries.push(new QueryData.DropTable({table, ifExists: true}))

    // Rename the temporary table to the old table name
    queries.push(
      new QueryData.AlterTable({
        table: table,
        renameTable: {from: tempTable.name}
      })
    )

    // Create missing indexes
    for (const index of Object.values(table.meta().indexes))
      queries.push(new QueryData.CreateIndex({table, index}))

    return queries
  }

  export function upgrade(
    formatter: Formatter,
    local: SchemaInstructions,
    schema: TableData,
    verbose = true
  ): Array<QueryData> {
    const columnNames = new Set([
      ...Object.keys(local.columns),
      ...Object.keys(schema.columns)
    ])
    const res: Array<QueryData> = []
    let recreate = false
    for (const columnName of columnNames) {
      const localInstruction = local.columns[columnName]
      const schemaCol = schema.columns[columnName]
      if (!localInstruction) {
        res.push(
          new QueryData.AlterTable({table: schema, addColumn: schemaCol})
        )
        if (verbose) console.log(`Adding column ${columnName}`)
      } else if (!schemaCol) {
        res.push(
          new QueryData.AlterTable({table: schema, dropColumn: columnName})
        )
        if (verbose) console.log(`Removing column ${columnName}`)
      } else {
        const {sql: instruction} = formatter.formatColumn(
          {stmt: new Statement(formatter)},
          {...schemaCol, references: undefined}
        )
        if (
          removeLeadingWhitespace(localInstruction) !==
          removeLeadingWhitespace(instruction)
        ) {
          if (verbose) console.log(`Recreating because ${columnName} differs`)
          recreate = true
        }
      }
    }

    // Indexes will be dropped and created again
    if (recreate) {
      const added = res
        .filter(
          (query): query is QueryData.AlterTable =>
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
        res.push(new QueryData.CreateIndex({table: schema, index: schemaIndex}))
        if (verbose) console.log(`Adding index ${indexName}`)
      } else if (!schemaIndex) {
        res.unshift(new QueryData.DropIndex({table: schema, name: indexName}))
        if (verbose) console.log(`Removing index ${indexName}`)
      } else {
        const {sql: instruction} = formatter.compile(
          new QueryData.CreateIndex({table: schema, index: schemaIndex})
        )
        if (
          removeLeadingWhitespace(localInstruction) !==
          removeLeadingWhitespace(instruction)
        ) {
          if (verbose) console.log(`Recreating index ${indexName}`)
          res.unshift(new QueryData.DropIndex({table: schema, name: indexName}))
          res.push(
            new QueryData.CreateIndex({table: schema, index: schemaIndex})
          )
        }
      }
    }
    return res
  }
}

export function schema(...tables: Array<Table<any>>) {}
