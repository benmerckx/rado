// Helpers for catalog rows, which are read for every table at once

// The rows of one table
export function own<Row extends {table: string}>(
  rows: Array<Row>,
  name: string
): Array<Row> {
  return rows.filter(row => row.table === name)
}

// A foreign key column, as the catalog lists it
export interface ReferenceRow {
  // Groups the columns of one key
  name: string
  column: string
  schema?: string
  target: string
  reference: string
  onDelete: string
  onUpdate: string
}

export interface Reference {
  name: string
  columns: Array<string>
  schema?: string
  table: string
  references: Array<string>
  onDelete: string
  onUpdate: string
}

// Foreign keys from their columns, in the order the rows list them
export function references(rows: Array<ReferenceRow>): Array<Reference> {
  return [...Map.groupBy(rows, row => row.name)].map(([name, rows]) => {
    const [{schema, target, onDelete, onUpdate}] = rows
    return {
      name,
      columns: rows.map(row => row.column),
      schema,
      table: target,
      references: rows.map(row => row.reference),
      onDelete,
      onUpdate
    }
  })
}
