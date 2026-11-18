import type {Database} from '../core/Database.ts'
import type {ColumnInfo, ForeignKeyInfo, Gen, TableInfo} from '../core/Push.ts'
import {type Sql, sql} from '../core/Sql.ts'

const {values} = Object

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

interface PragmaColumn {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

interface PragmaIndex {
  name: string
  unique: number
  origin: string
}

interface PragmaForeignKey {
  id: number
  table: string
  from: string
  to: string | null
  on_update: string
  on_delete: string
}

export interface SchemaRow {
  type: string
  name: string
  sql: string | null
}

function pragma(tx: Database, name: string, target: string): unknown {
  return tx.all(sql`select * from ${sql.unsafe(name)}(${sql.inline(target)})`)
}

export function schema(tx: Database, where: Sql): unknown {
  return tx.all(
    sql`select type, name, sql from sqlite_master where ${where} order by rowid`
  )
}

export function* inspect(
  tx: Database,
  name: string,
  copy = false
): Gen<TableInfo | undefined> {
  const rows: Array<PragmaColumn> = yield pragma(tx, 'pragma_table_info', name)
  if (rows.length === 0) return undefined
  const master: Array<SchemaRow> = yield schema(
    tx,
    sql`tbl_name = ${sql.inline(name)}`
  )
  const primary = rows
    .filter(row => row.pk > 0)
    .toSorted((a, b) => a.pk - b.pk)
    .map(row => row.name)
  // String literals are left out, a default can contain any word
  const autoIncrement = /\bautoincrement\b/i.test(
    master.find(row => row.type === 'table')!.sql!.replace(/'([^']|'')*'/g, '')
  )
  const columns: Record<string, ColumnInfo> = {}
  for (const row of rows) {
    const value = row.dflt_value?.trim() ?? null
    columns[row.name] = {
      type: normalize(row.type),
      notNull: Boolean(row.notnull),
      default: value && (value.includes("'") ? value : value.toLowerCase()),
      extra: autoIncrement && primary[0] === row.name ? 'autoincrement' : ''
    }
  }
  const constraints: Record<string, string> = {}
  if (primary.length > 0) constraints.primary = `primary key (${primary})`
  const indexes: Record<string, string> = {}
  const list: Array<PragmaIndex> = yield pragma(tx, 'pragma_index_list', name)
  for (const index of list) {
    if (index.origin === 'u') {
      const info: Array<{name: string}> = yield pragma(
        tx,
        'pragma_index_info',
        index.name
      )
      constraints[index.name] = `unique (${info.map(column => column.name)})`
    } else if (index.origin === 'c') {
      const text = normalize(master.find(row => row.name === index.name)!.sql!)
      indexes[copy ? index.name.slice(prefix.length) : index.name] =
        (index.unique ? 'unique ' : '') + text.slice(text.indexOf('('))
    }
  }
  const fks: Array<PragmaForeignKey> = yield pragma(
    tx,
    'pragma_foreign_key_list',
    name
  )
  const foreignKeys: Record<number, ForeignKeyInfo> = {}
  for (const fk of fks) {
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
  const [{wr}]: Array<{wr: number}> = yield tx.all(
    sql`select wr from pragma_table_list where schema = 'main' and name = ${sql.inline(name)}`
  )
  // The column that is the rowid, an empty string if it is hidden, false
  // for a table without rowid. A primary key with an index of its own, as
  // integer primary key desc has, isn't the rowid
  const rowid = wr
    ? false
    : primary.length === 1 &&
        columns[primary[0]].type === 'integer' &&
        !list.some(index => index.origin === 'pk')
      ? primary[0]
      : ''
  return {
    columns,
    constraints,
    indexes,
    foreignKeys: values(foreignKeys),
    rowid
  }
}
