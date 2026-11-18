import type {Database} from '../core/Database.ts'
import type {Gen} from '../core/Push.ts'
import {sql} from '../core/Sql.ts'

export type Row = Record<string, any>

// The catalog rows of a table, as sqlite reports them
export interface Rows {
  name: string
  wr: number
  columns: Array<Row>
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
    ', pragma_table_info(t.name, t.schema) x'
  )
  // libsql's sqlite 3.45 returns nothing when the schema is passed on
  // twice, without it the index is looked up by name
  const keys: Array<Row> = yield select(
    'l.name, l."unique", l.origin, i.name as col',
    ', pragma_index_list(t.name, t.schema) l, pragma_index_info(l.name) i',
    ' order by l.seq, i.seqno'
  )
  const fks: Array<Row> = yield select(
    'x.*',
    ', pragma_foreign_key_list(t.name, t.schema) x',
    ' order by x.id, x.seq'
  )
  const master: Array<Row> = yield tx.all(
    sql`select name, sql from ${sql.identifier(schema)}.sqlite_master`
  )
  const text = Object.fromEntries(master.map(row => [row.name, row.sql]))
  const own = (rows: Array<Row>, name: string) =>
    rows.filter(row => row.tbl === name)
  return tables.map(({tbl, wr}) => ({
    name: tbl,
    wr,
    columns: own(columns, tbl),
    keys: own(keys, tbl),
    fks: own(fks, tbl),
    sql: text
  }))
}
