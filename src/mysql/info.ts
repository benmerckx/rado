import type {Database} from '../core/Database.ts'
import type {ColumnInfo, ForeignKeyInfo, Gen, TableInfo} from '../core/Push.ts'
import {catalog} from './catalog.ts'

const {entries, values} = Object

export const quote = (name: string) => `\`${name.replaceAll('`', '``')}\``

// The table in the form push compares, with renamed columns under their
// new names
export function* info(
  tx: Database,
  name: string,
  schema: string,
  renamed: Record<string, string> = {}
): Gen<TableInfo | undefined> {
  const [table] = yield* catalog(tx, schema, [name])
  if (!table) return undefined
  const as = (column: string) => renamed[column] ?? column
  const columns: Record<string, ColumnInfo> = {}
  for (const row of table.columns)
    columns[as(row.name)] = {
      type: row.type.toLowerCase(),
      notNull: row.nullable === 'NO',
      default: row.value,
      extra: row.extra.toLowerCase().replace('default_generated', '').trim()
    }
  const keys: Record<string, {unique: boolean; columns: Array<string>}> = {}
  for (const row of table.keys)
    (keys[row.name] ??= {
      unique: Number(row.non_unique) === 0,
      columns: []
    }).columns.push(
      (row.expression
        ? `(${row.expression})`
        : quote(as(row.column)) + (row.sub_part ? `(${row.sub_part})` : '')) +
        (row.collation === 'D' ? ' desc' : '')
    )
  const constraints: Record<string, string> = {}
  const indexes: Record<string, string> = {}
  for (const [key, {unique, columns}] of entries(keys))
    if (key === 'PRIMARY') constraints.primary = `primary key (${columns})`
    else indexes[key] = `${unique ? 'unique ' : ''}(${columns})`
  const fks: Record<string, ForeignKeyInfo> = {}
  for (const row of table.fks) {
    const fk = (fks[row.name] ??= {
      name: row.name,
      columns: [],
      schema: row.ref_schema,
      table: row.ref_table,
      references: [],
      onDelete: row.on_delete.toLowerCase(),
      onUpdate: row.on_update.toLowerCase()
    })
    fk.columns.push(as(row.column))
    fk.references.push(
      row.ref_table === name && row.ref_schema === schema
        ? as(row.ref_column)
        : row.ref_column
    )
  }
  return {columns, constraints, indexes, foreignKeys: values(fks)}
}
