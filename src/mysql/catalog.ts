import type {Database} from '../core/Database.ts'
import type {Gen} from '../core/Push.ts'
import {sql} from '../core/Sql.ts'

export type Row = Record<string, any>

export const quote = (name: string) => `\`${name.replaceAll('`', '``')}\``

// A key part as an index definition writes it
export function part(row: Row, column: string = row.column): string {
  return (
    (row.expression
      ? `(${row.expression})`
      : quote(column) + (row.sub_part ? `(${row.sub_part})` : '')) +
    (row.collation === 'D' ? ' desc' : '')
  )
}

// The catalog rows of a table, as mysql reports them
export interface Rows {
  name: string
  columns: Array<Row>
  keys: Array<Row>
  fks: Array<Row>
}

// One query per kind of object, for every table at once. Queries are kept
// compact, template whitespace survives minification
export function* catalog(
  tx: Database,
  schema: string,
  names?: Array<string>
): Gen<Array<Rows>> {
  const where = (k = '') =>
    sql.join([
      sql`${sql.unsafe(k)}table_schema = ${schema}`,
      names &&
        sql`and ${sql.unsafe(k)}table_name in (${sql.join(
          names.map(sql.inline),
          sql`, `
        )})`
    ])
  const tables: Array<Row> = yield tx.all(sql`select table_name as name from
information_schema.tables where ${where()} and table_type = 'BASE TABLE' order
by table_name`)
  const columns: Array<Row> = yield tx.all(sql`select table_name as tbl,
column_name as name, column_type as type, is_nullable as nullable,
column_default as value, extra as extra, generation_expression as expr
from information_schema.columns where
${where()} order by ordinal_position`)
  const keys: Array<Row> = yield tx.all(sql`select table_name as tbl,
index_name as name, column_name as \`column\`, non_unique as non_unique,
collation as collation, sub_part as sub_part, expression as expression, index_type as kind from
information_schema.statistics where ${where()} order by index_name,
seq_in_index`)
  const fks: Array<Row> = yield tx.all(sql`select k.table_name as tbl,
k.constraint_name as name, k.column_name as \`column\`,
k.referenced_table_schema as ref_schema, k.referenced_table_name as
ref_table, k.referenced_column_name as ref_column, r.update_rule as
on_update, r.delete_rule as on_delete from information_schema.key_column_usage
k join information_schema.referential_constraints r on r.constraint_schema =
k.constraint_schema and r.constraint_name = k.constraint_name and r.table_name
= k.table_name where ${where(
    'k.'
  )} and k.referenced_table_name is not null order by k.constraint_name,
k.ordinal_position`)
  const own = (rows: Array<Row>, name: string) =>
    rows.filter(row => row.tbl === name)
  return tables.map(({name}) => ({
    name,
    columns: own(columns, name),
    keys: own(keys, name),
    fks: own(fks, name)
  }))
}
