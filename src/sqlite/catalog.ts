import {call} from '../core/Call.ts'
import {own} from '../core/Catalog.ts'
import type {Database} from '../core/Database.ts'
import {and, eq, inArray, ne} from '../core/expr/Conditions.ts'
import {schema as define} from '../core/Schema.ts'
import {sql} from '../core/Sql.ts'
import {alias, table} from '../core/Table.ts'
import type {Gen} from '../core/Transaction.ts'
import {integer, text} from './columns.ts'

// Aliased, temp's master is a table of another name
export const Master = <Name extends string>(schema: string, name: Name) =>
  alias(
    define(schema).table('sqlite_master', {
      rowid: integer().notNull(),
      type: text().notNull(),
      name: text().notNull(),
      tbl_name: text().notNull(),
      sql: text()
    }),
    name
  )

const Tables = table('pragma_table_list', {
  schema: text().notNull(),
  name: text().notNull(),
  type: text().notNull(),
  wr: integer().notNull()
})

const Columns = table('pragma_table_xinfo', {
  cid: integer().notNull(),
  name: text().notNull(),
  type: text().notNull(),
  notnull: integer().notNull(),
  dflt_value: text(),
  pk: integer().notNull(),
  hidden: integer().notNull()
})

const Indexes = table('pragma_index_list', {
  seq: integer().notNull(),
  name: text().notNull(),
  unique: integer().notNull(),
  origin: text().notNull()
})

const Parts = table('pragma_index_info', {
  seqno: integer().notNull(),
  name: text()
})

const References = table('pragma_foreign_key_list', {
  id: integer().notNull(),
  seq: integer().notNull(),
  table: text().notNull(),
  from: text().notNull(),
  to: text(),
  on_update: text().notNull(),
  on_delete: text().notNull()
})

function* query(tx: Database, schema: string, names?: Array<string>) {
  const t = alias(Tables, 't')
  const where = and(
    eq(t.schema, sql.inline(schema)),
    eq(t.type, 'table'),
    sql<boolean>`${t.name} not glob 'sqlite_*'`,
    names && inArray(t.name, names)
  )
  const tables = yield* tx
    .select({name: t.name, withoutRowid: eq(t.wr, 1)})
    .from(t)
    .where(where)
    .orderBy(t.name)
  const x = call(Columns, 'x', t.name, t.schema)
  const columns = yield* tx
    .select({
      table: t.name,
      name: x.name,
      type: x.type,
      notNull: ne(x.notnull, 0),
      value: x.dflt_value,
      key: x.pk,
      // Generated columns are hidden
      hidden: ne(x.hidden, 0)
    })
    .from(t)
    .crossJoin(x)
    .where(where)
  // libsql's sqlite 3.45 returns nothing when the schema column is passed
  // on twice, a literal works. Without one, an index by the same name in
  // temp or main is read instead
  const l = call(Indexes, 'l', t.name, t.schema)
  const i = call(Parts, 'i', l.name, sql.inline(schema))
  const keys = yield* tx
    .select({
      table: t.name,
      name: l.name,
      unique: ne(l.unique, 0),
      origin: l.origin,
      column: i.name
    })
    .from(t)
    .crossJoin(l)
    .crossJoin(i)
    .where(where)
    .orderBy(l.seq, i.seqno)
  const f = call(References, 'f', t.name, t.schema)
  const foreignKeys = yield* tx
    .select({
      table: t.name,
      name: sql<string>`cast(${f.id} as text)`,
      column: f.from,
      target: f.table,
      reference: sql<string>`coalesce(${f.to}, '')`,
      onUpdate: f.on_update,
      onDelete: f.on_delete
    })
    .from(t)
    .crossJoin(f)
    .where(where)
    .orderBy(f.id, f.seq)
  // Triggers have a namespace of their own, one can share a table's name
  const master = Master(schema, 'm')
  const statements = yield* tx
    .select({name: master.name, sql: master.sql})
    .from(master)
    .where(inArray(master.type, ['table', 'index']))
  return {tables, columns, keys, foreignKeys, statements}
}

type Rows = ReturnType<typeof query> extends Gen<infer T> ? T : never

export interface Entry {
  name: string
  withoutRowid: boolean
  // Generated columns are among them, with a hidden flag
  columns: Rows['columns']
  primary: Array<string>
  // Whether the primary key is autoincrement
  increments: boolean
  keys: Rows['keys']
  foreignKeys: Rows['foreignKeys']
  // Create statements by name, of the table and its indexes
  sql: Record<string, string>
}

// One query per kind of object, for every table at once
export function* catalog(
  tx: Database,
  schema: string,
  names?: Array<string>
): Gen<Array<Entry>> {
  const rows = yield* query(tx, schema, names)
  const text = Object.fromEntries(
    rows.statements.map(row => [row.name, row.sql ?? ''])
  )
  return rows.tables.map(({name, withoutRowid}) => {
    const columns = own(rows.columns, name)
    return {
      name,
      withoutRowid,
      columns,
      primary: columns
        .filter(column => column.key > 0)
        .toSorted((a, b) => a.key - b.key)
        .map(column => column.name),
      // String literals are left out, a default can contain any word
      increments: /\bautoincrement\b/i.test(
        text[name].replace(/'([^']|'')*'/g, '')
      ),
      keys: own(rows.keys, name),
      foreignKeys: own(rows.foreignKeys, name),
      sql: text
    }
  })
}
