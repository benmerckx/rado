import type {Database} from '../core/Database.ts'
import type {ColumnInfo, ForeignKeyInfo, Gen, TableInfo} from '../core/Push.ts'
import {catalog} from './catalog.ts'

const {entries, values} = Object

export const prefix = '__rado_'

// Lowercases and strips quotes outside string literals, which stay intact
function normalize(text: string): string {
  return text
    .split(/('(?:[^']|'')*')/)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .toLowerCase()
            .replace(/["`[\]]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/ ?([(),=<>]) ?/g, '$1')
    )
    .join('')
}

// The table in the form push compares, the scratch copy without its prefix
export function* info(
  tx: Database,
  name: string,
  copy = false
): Gen<TableInfo | undefined> {
  const [table] = yield* catalog(tx, 'main', [name])
  if (!table) return undefined
  const {primary} = table
  const columns: Record<string, ColumnInfo> = {}
  // Generated columns stay out, push can't define them
  for (const row of table.columns.filter(row => !row.hidden)) {
    const value = row.dflt_value?.trim() ?? null
    columns[row.name] = {
      type: normalize(row.type),
      notNull: Boolean(row.notnull),
      default: value && (value.includes("'") ? value : value.toLowerCase()),
      extra: table.increments && primary[0] === row.name ? 'autoincrement' : ''
    }
  }
  const constraints: Record<string, string> = {}
  if (primary.length > 0) constraints.primary = `primary key (${primary})`
  const indexes: Record<string, string> = {}
  const uniques: Record<string, Array<string>> = {}
  for (const key of table.keys) {
    if (key.origin === 'u') (uniques[key.name] ??= []).push(key.col)
    else if (key.origin === 'c') {
      const text = normalize(table.sql[key.name])
      indexes[copy ? key.name.slice(prefix.length) : key.name] =
        (key.unique ? 'unique ' : '') + text.slice(text.indexOf('('))
    }
  }
  for (const [key, cols] of entries(uniques))
    constraints[key] = `unique (${cols})`
  const foreignKeys: Record<number, ForeignKeyInfo> = {}
  for (const fk of table.fks) {
    const entry = (foreignKeys[fk.id] ??= {
      columns: [],
      table: fk.table,
      references: [],
      onDelete: fk.on_delete.toLowerCase(),
      onUpdate: fk.on_update.toLowerCase()
    })
    entry.columns.push(fk.from)
    entry.references.push(fk.to ?? '')
  }
  return {
    columns,
    constraints,
    indexes,
    foreignKeys: values(foreignKeys),
    // The column that is the rowid, an empty string if it is hidden, false
    // for a table without rowid. A primary key with an index of its own, as
    // integer primary key desc has, isn't the rowid
    rowid: table.wr
      ? false
      : primary.length === 1 &&
          columns[primary[0]].type === 'integer' &&
          !table.keys.some(key => key.origin === 'pk')
        ? primary[0]
        : ''
  }
}
