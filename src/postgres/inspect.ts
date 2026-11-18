import type {Database} from '../core/Database.ts'
import type {ColumnInfo, ForeignKeyInfo, Gen, TableInfo} from '../core/Push.ts'
import {sql} from '../core/Sql.ts'

const {values} = Object

const actions: Record<string, string> = {
  a: 'no action',
  r: 'restrict',
  c: 'cascade',
  n: 'set null',
  d: 'set default'
}

interface ColumnRow {
  name: string
  type: string
  notNull: boolean
  default: string | null
  identity: string
}

interface ForeignKeyRow {
  name: string
  column: string
  table: string
  reference: string
  onUpdate: string
  onDelete: string
}

type Named = Array<{name: string; def: string}>

// Queries are kept compact, template whitespace survives minification
export function* inspect(
  tx: Database,
  name: string,
  schema: string
): Gen<TableInfo | undefined> {
  const found: {oid: unknown} | null = yield tx.get(sql`select c.oid from
pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relname =
${name} and n.nspname = ${schema} and c.relkind in ('r', 'p')`)
  if (!found) return undefined
  const oid = sql`${sql.inline(String(found.oid))}::oid`
  // Objects outside the search path are printed with their schema
  const local = (text: string) =>
    text.replaceAll(`"${schema}".`, '').replaceAll(`${schema}.`, '')
  const rows: Array<ColumnRow> = yield tx.all(sql`select a.attname as name,
format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as "notNull",
pg_get_expr(d.adbin, d.adrelid) as default, a.attidentity::text as identity
from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and
d.adnum = a.attnum where a.attrelid = ${oid} and a.attnum > 0 and not
a.attisdropped order by a.attnum`)
  const columns: Record<string, ColumnInfo> = {}
  for (const row of rows)
    columns[row.name] = {
      type: local(row.type),
      notNull: row.notNull,
      default: row.default && local(row.default),
      extra: row.identity
    }
  const constraints: Record<string, string> = {}
  const constraintRows: Named = yield tx.all(sql`select conname as name,
pg_get_constraintdef(oid) as def from pg_constraint where conrelid = ${oid}
and contype in ('p', 'u')`)
  for (const row of constraintRows) constraints[row.name] = row.def
  const indexes: Record<string, string> = {}
  const indexRows: Named = yield tx.all(sql`select i.relname as name,
pg_get_indexdef(x.indexrelid) as def from pg_index x join pg_class i on i.oid
= x.indexrelid where x.indrelid = ${oid} and not exists (select 1 from
pg_constraint where conindid = x.indexrelid and conrelid = ${oid})`)
  for (const {name, def} of indexRows)
    indexes[name] =
      (def.startsWith('CREATE UNIQUE') ? 'unique ' : '') +
      def.slice(def.indexOf(' USING '))
  const fkRows: Array<ForeignKeyRow> = yield tx.all(sql`select conname as
name, a.attname as column, r.relname as table, ra.attname as reference,
confupdtype::text as "onUpdate", confdeltype::text as "onDelete" from
pg_constraint join pg_class r on r.oid = confrelid cross join lateral
unnest(conkey, confkey) with ordinality as k(num, ref, pos) join pg_attribute
a on a.attrelid = conrelid and a.attnum = k.num join pg_attribute ra on
ra.attrelid = confrelid and ra.attnum = k.ref where conrelid = ${oid} and
contype = 'f' order by conname, k.pos`)
  const fks: Record<string, ForeignKeyInfo> = {}
  for (const row of fkRows) {
    const fk = (fks[row.name] ??= {
      name: row.name,
      columns: [],
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
