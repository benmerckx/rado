import {references} from '../core/Catalog.ts'
import type {Database} from '../core/Database.ts'
import type {ColumnShape, Shape} from '../core/Shape.ts'
import type {Gen} from '../core/Transaction.ts'
import {catalog, part} from './catalog.ts'

// The table in the form push compares, with renamed columns under their
// new names
export function* shape(
  tx: Database,
  name: string,
  schema: string,
  renamed: Record<string, string> = {}
): Gen<Shape | undefined> {
  const [table] = yield* catalog(tx, schema, [name])
  if (!table) return undefined
  const as = (column: string) => renamed[column] ?? column
  const columns = Object.fromEntries(
    table.columns.map((column): [string, ColumnShape] => [
      as(column.name),
      {
        type: column.type.toLowerCase(),
        notNull: column.notNull,
        default: column.value,
        extra: column.extra
          .toLowerCase()
          .replace('default_generated', '')
          .trim()
      }
    ])
  )
  const constraints: Record<string, string> = {}
  const indexes: Record<string, string> = {}
  for (const [key, parts] of Map.groupBy(table.keys, key => key.name)) {
    const list = parts.map(key =>
      tx.dialect.inline(part(key, as(key.column ?? '')))
    )
    if (key === 'PRIMARY') constraints.primary = `primary key (${list})`
    else indexes[key] = `${parts[0].unique ? 'unique ' : ''}(${list})`
  }
  const self = (key: {schema?: string; table: string}) =>
    key.table === name && key.schema === schema
  return {
    columns,
    constraints,
    indexes,
    foreignKeys: references(table.foreignKeys).map(key => ({
      ...key,
      columns: key.columns.map(as),
      references: self(key) ? key.references.map(as) : key.references,
      onDelete: key.onDelete.toLowerCase(),
      onUpdate: key.onUpdate.toLowerCase()
    }))
  }
}
