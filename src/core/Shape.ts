// A table as push compares it: normalized, so a live table and its desired
// copy read the same when they match

export interface ColumnShape {
  type: string
  notNull: boolean
  default: string | null
  extra: string
}

export interface ForeignKeyShape {
  name?: string
  columns: Array<string>
  schema?: string
  table: string
  references: Array<string>
  onDelete: string
  onUpdate: string
  // Defined on the column, so it can't be named
  inline?: boolean
}

export interface Shape {
  columns: Record<string, ColumnShape>
  // Definitions by name
  constraints: Record<string, string>
  indexes: Record<string, string>
  foreignKeys: Array<ForeignKeyShape>
  // The column that is the rowid, an empty string if it is hidden, false
  // for a table without rowid
  rowid?: string | false
}
