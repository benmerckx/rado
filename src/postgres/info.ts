import type {Database} from '../core/Database.ts'
import type {ColumnInfo, ForeignKeyInfo, Gen, TableInfo} from '../core/Push.ts'
import {catalog} from './catalog.ts'

const {values} = Object

export const actions: Record<string, string> = {
  a: 'no action',
  r: 'restrict',
  c: 'cascade',
  n: 'set null',
  d: 'set default'
}

// The table in the form push compares
export function* info(
  tx: Database,
  name: string,
  schema: string
): Gen<TableInfo | undefined> {
  const [table] = yield* catalog(tx, schema, [name])
  if (!table) return undefined
  const columns: Record<string, ColumnInfo> = {}
  for (const row of table.columns)
    columns[row.name] = {
      type: row.type,
      notNull: row.notNull,
      default: row.default,
      extra: row.identity
    }
  const constraints: Record<string, string> = {}
  for (const row of table.keys) constraints[row.name] = row.def
  const indexes: Record<string, string> = {}
  for (const row of table.indexes)
    indexes[row.name] =
      (row.unique ? 'unique ' : '') + row.def.slice(row.def.indexOf(' USING '))
  const fks: Record<string, ForeignKeyInfo> = {}
  for (const row of table.fks) {
    const fk = (fks[row.name] ??= {
      name: row.name,
      columns: [],
      schema: row.schema,
      table: row.table,
      references: [],
      onDelete: actions[row.onDelete],
      onUpdate: actions[row.onUpdate]
    })
    fk.columns.push(row.column)
    fk.references.push(row.reference)
  }
  return {columns, constraints, indexes, foreignKeys: values(fks)}
}
