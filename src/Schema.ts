import {ColumnData} from './Column'
import {ExprData} from './Expr'
import {Formatter} from './Formatter'
import {Query} from './Query'

export interface Index {
  name: string
  on: Array<ExprData>
  where?: ExprData
}

export interface Schema {
  name: string
  alias?: string
  columns: Record<string, ColumnData>
  indexes: Record<string, Index>
}

export interface SchemaInstructions {
  columns: Record<string, string>
  indexes: Record<string, string>
}

export namespace Schema {
  export function create(schema: Schema) {
    const queries = []
    queries.push(Query.CreateTable({table: schema, ifNotExists: true}))
    for (const index of Object.values(schema.indexes))
      queries.push(Query.CreateIndex({table: schema, index, ifNotExists: true}))
    return Query.Batch({queries})
  }

  export function upgrade(
    formatter: Formatter,
    local: SchemaInstructions,
    schema: Schema
  ): Array<Query> {
    const columnNames = new Set([
      ...Object.keys(local.columns),
      ...Object.keys(schema.columns)
    ])
    const res: Array<Query> = []
    for (const columnName of columnNames) {
      const localInstruction = local.columns[columnName]
      const schemaCol = schema.columns[columnName]
      if (!localInstruction) {
        res.push(Query.AlterTable({table: schema, addColumn: schemaCol}))
      } else if (!schemaCol) {
        res.push(Query.AlterTable({table: schema, dropColumn: columnName}))
      } else {
        const [instruction] = formatter
          .formatColumn({...schemaCol, references: undefined})
          .compile(formatter)
        if (localInstruction !== instruction) {
          res.push(Query.AlterTable({table: schema, alterColumn: schemaCol}))
        }
      }
    }
    const indexNames = new Set([
      ...Object.keys(local.indexes),
      ...Object.keys(schema.indexes)
    ])
    for (const indexName of indexNames) {
      const localInstruction = local.indexes[indexName]
      const schemaIndex = schema.indexes[indexName]
      if (!localInstruction) {
        res.push(Query.CreateIndex({table: schema, index: schemaIndex}))
      } else if (!schemaIndex) {
        res.push(Query.DropIndex({table: schema, index: schemaIndex}))
      } else {
        const [instruction] = formatter
          .formatCreateIndex(
            Query.CreateIndex({table: schema, index: schemaIndex})
          )
          .compile(formatter)
        if (localInstruction !== instruction) {
          res.push(Query.DropIndex({table: schema, index: schemaIndex}))
          res.push(Query.CreateIndex({table: schema, index: schemaIndex}))
        }
      }
    }
    return res
  }
}
