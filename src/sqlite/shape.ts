import {references} from '../core/Catalog.ts'
import type {Database} from '../core/Database.ts'
import type {ColumnShape, Shape} from '../core/Shape.ts'
import type {Gen} from '../core/Transaction.ts'
import {catalog} from './catalog.ts'

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
export function* shape(
  tx: Database,
  name: string,
  copy = false
): Gen<Shape | undefined> {
  const [table] = yield* catalog(tx, 'main', [name])
  if (!table) return undefined
  const {primary} = table
  // Generated columns stay out, push can't define them
  const columns = Object.fromEntries(
    table.columns
      .filter(column => !column.hidden)
      .map((column): [string, ColumnShape] => {
        const value = column.value?.trim() ?? null
        const increments = table.increments && primary[0] === column.name
        return [
          column.name,
          {
            type: normalize(column.type),
            notNull: column.notNull,
            default:
              value && (value.includes("'") ? value : value.toLowerCase()),
            extra: increments ? 'autoincrement' : ''
          }
        ]
      })
  )
  const constraints: Record<string, string> = {}
  if (primary.length > 0) constraints.primary = `primary key (${primary})`
  const indexes: Record<string, string> = {}
  for (const [key, parts] of Map.groupBy(table.keys, key => key.name)) {
    const [{origin, unique}] = parts
    if (origin === 'u')
      constraints[key] = `unique (${parts.map(part => part.column)})`
    else if (origin === 'c') {
      const text = normalize(table.sql[key])
      indexes[copy ? key.slice(prefix.length) : key] =
        (unique ? 'unique ' : '') + text.slice(text.indexOf('('))
    }
  }
  // A primary key with an index of its own, as integer primary key desc
  // has, isn't the rowid
  const rowid =
    primary.length === 1 &&
    columns[primary[0]].type === 'integer' &&
    !table.keys.some(key => key.origin === 'pk')
  return {
    columns,
    constraints,
    indexes,
    foreignKeys: references(table.foreignKeys).map(
      ({columns, table, references, onDelete, onUpdate}) => ({
        columns,
        table,
        references,
        onDelete: onDelete.toLowerCase(),
        onUpdate: onUpdate.toLowerCase()
      })
    ),
    rowid: table.withoutRowid ? false : rowid ? primary[0] : ''
  }
}
