import type {Database} from '../core/Database.ts'
import type {ColumnInfo, ForeignKeyInfo, Gen, TableInfo} from '../core/Push.ts'
import {sql} from '../core/Sql.ts'

const {entries, values} = Object

const quote = (name: string) => `\`${name.replaceAll('`', '``')}\``

interface ColumnRow {
  name: string
  type: string
  nullable: string
  value: string | null
  extra: string
}

interface KeyRow {
  name: string
  column: string | null
  non_unique: number | string
  collation: string | null
  sub_part: number | null
  expression: string | null
}

interface ForeignKeyRow {
  name: string
  column: string
  ref_schema: string
  ref_table: string
  ref_column: string
  on_update: string
  on_delete: string
}

// Queries are kept compact, template whitespace survives minification
export function* inspect(
  tx: Database,
  name: string,
  schema: string,
  renamed: Record<string, string> = {}
): Gen<TableInfo | undefined> {
  const as = (column: string) => renamed[column] ?? column
  const where = sql`table_schema = ${schema} and table_name = ${name}`
  const rows: Array<ColumnRow> = yield tx.all(sql`select column_name as name,
column_type as type, is_nullable as nullable, column_default as value, extra
as extra from information_schema.columns where ${where} order by ordinal_position`)
  if (rows.length === 0) return undefined
  const columns: Record<string, ColumnInfo> = {}
  for (const row of rows)
    columns[as(row.name)] = {
      type: row.type.toLowerCase(),
      notNull: row.nullable === 'NO',
      default: row.value,
      extra: row.extra.toLowerCase().replace('default_generated', '').trim()
    }
  const keyRows: Array<KeyRow> = yield tx.all(sql`select index_name as name,
column_name as \`column\`, non_unique as non_unique, collation as collation,
sub_part as sub_part, expression as expression from
information_schema.statistics where ${where} order by index_name,
seq_in_index`)
  const keys: Record<string, {unique: boolean; columns: Array<string>}> = {}
  for (const row of keyRows)
    (keys[row.name] ??= {
      unique: Number(row.non_unique) === 0,
      columns: []
    }).columns.push(
      (row.expression
        ? `(${row.expression})`
        : quote(as(row.column!)) + (row.sub_part ? `(${row.sub_part})` : '')) +
        (row.collation === 'D' ? ' desc' : '')
    )
  const constraints: Record<string, string> = {}
  const indexes: Record<string, string> = {}
  for (const [key, {unique, columns}] of entries(keys))
    if (key === 'PRIMARY') constraints.primary = `primary key (${columns})`
    else indexes[key] = `${unique ? 'unique ' : ''}(${columns})`
  const fkRows: Array<ForeignKeyRow> = yield tx.all(sql`select
k.constraint_name as name, k.column_name as \`column\`,
k.referenced_table_schema as ref_schema, k.referenced_table_name as
ref_table, k.referenced_column_name as ref_column,
r.update_rule as on_update, r.delete_rule as on_delete from
information_schema.key_column_usage k join
information_schema.referential_constraints r on r.constraint_schema =
k.constraint_schema and r.constraint_name = k.constraint_name and r.table_name
= k.table_name where k.table_schema = ${schema} and k.table_name = ${name}
and k.referenced_table_name is not null order by k.constraint_name,
k.ordinal_position`)
  const fks: Record<string, ForeignKeyInfo> = {}
  for (const row of fkRows) {
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

// DDL is not transactional, so renames are applied to what was read and the
// desired table is created next to the real one and dropped after
