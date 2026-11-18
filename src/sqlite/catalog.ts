import type {Database} from '../core/Database.ts'
import type {Gen} from '../core/Push.ts'
import {sql} from '../core/Sql.ts'

export type Row = Record<string, any>

// The catalog rows of a table, as sqlite reports them
export interface Rows {
  name: string
  wr: number
  // Generated columns are among them, with a hidden flag
  columns: Array<Row>
  primary: Array<string>
  // Whether the primary key is autoincrement
  increments: boolean
  keys: Array<Row>
  fks: Array<Row>
  // Create statements by name, of the table and its indexes
  sql: Record<string, string>
}

// One query per kind of object, for every table at once
export function* catalog(
  tx: Database,
  schema: string,
  names?: Array<string>
): Gen<Array<Rows>> {
  const where = sql.join([
    sql`t.schema = ${sql.inline(schema)} and t.type = 'table' and t.name not glob 'sqlite_*'`,
    names && sql`and t.name in (${sql.join(names.map(sql.inline), sql`, `)})`
  ])
  const select = (what: string, from = '', order = '') =>
    tx.all(
      sql`select t.name as tbl, ${sql.unsafe(what)} from pragma_table_list t${sql.unsafe(
        from
      )} where ${where}${sql.unsafe(order)}`
    )
  const tables: Array<Row> = yield select('t.wr', '', ' order by t.name')
  const columns: Array<Row> = yield select(
    'x.*',
    ', pragma_table_xinfo(t.name, t.schema) x'
  )
  // libsql's sqlite 3.45 returns nothing when the schema column is passed
  // on twice, a literal works. Without one, an index by the same name in
  // temp or main is read instead
  const keys: Array<Row> = yield select(
    'l.name, l."unique", l.origin, i.name as col',
    `, pragma_index_list(t.name, t.schema) l, pragma_index_info(l.name, '${schema.replaceAll("'", "''")}') i`,
    ' order by l.seq, i.seqno'
  )
  const fks: Array<Row> = yield select(
    'x.*',
    ', pragma_foreign_key_list(t.name, t.schema) x',
    ' order by x.id, x.seq'
  )
  // Triggers have a namespace of their own, one can share a table's name
  const master: Array<Row> = yield tx.all(
    sql`select name, sql from ${sql.identifier(
      schema
    )}.sqlite_master where type in ('table', 'index')`
  )
  const text = Object.fromEntries(master.map(row => [row.name, row.sql]))
  const own = (rows: Array<Row>, name: string) =>
    rows.filter(row => row.tbl === name)
  return tables.map(({tbl, wr}) => ({
    name: tbl,
    wr,
    columns: own(columns, tbl),
    primary: own(columns, tbl)
      .filter(row => row.pk > 0)
      .toSorted((a, b) => a.pk - b.pk)
      .map(row => row.name),
    // String literals are left out, a default can contain any word
    increments: /\bautoincrement\b/i.test(
      text[tbl].replace(/'([^']|'')*'/g, '')
    ),
    keys: own(keys, tbl),
    fks: own(fks, tbl),
    sql: text
  }))
}
