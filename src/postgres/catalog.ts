import type {Database} from '../core/Database.ts'
import {type Gen, scratch} from '../core/Push.ts'
import {type Sql, sql} from '../core/Sql.ts'

export type Row = Record<string, any>

// The catalog rows of a table, as postgres reports them
export interface Rows {
  name: string
  columns: Array<Row>
  keys: Array<Row>
  indexes: Array<Row>
  fks: Array<Row>
}

// Puts a schema first in the search path until the transaction ends
export function* prepend(tx: Database, schema: string): Gen<void> {
  const {path}: {path: string} = yield tx.get(
    sql`select current_setting('search_path') as path`
  )
  yield tx.run(
    sql`set local search_path to ${sql.identifier(schema)}, ${sql.unsafe(path)}`
  )
}

// The tables of a schema, or some of them, as a subquery of oids
export function relations(schema: string, names?: Array<string>): Sql {
  return sql.join([
    sql`select c.oid from pg_class c join pg_namespace n on n.oid =
c.relnamespace where n.nspname = ${schema} and c.relkind in ('r', 'p')`,
    names && sql`and c.relname in (${sql.join(names.map(sql.inline), sql`, `)})`
  ])
}

// One query per kind of object, for every table at once. Read with the
// schema first in the search path, so names in types and defaults print
// the same for a table and its scratch copy. Queries are kept compact,
// template whitespace survives minification
export function* catalog(
  tx: Database,
  schema: string,
  names?: Array<string>
): Gen<Array<Rows>> {
  return yield* scratch(tx, function* (sp) {
    yield* prepend(sp, schema)
    const rels = relations(schema, names)
    const tables: Array<Row> = yield sp.all(sql`select oid::text as rel,
relname as name from pg_class where oid in (${rels}) order by relname`)
    const columns: Array<Row> = yield sp.all(sql`select a.attrelid::text as
rel, a.attname as name, format_type(a.atttypid, a.atttypmod) as type,
a.attnotnull as "notNull", pg_get_expr(d.adbin, d.adrelid) as default,
a.attidentity::text as identity, a.attgenerated::text as generated from
pg_attribute a left join pg_attrdef d on
d.adrelid = a.attrelid and d.adnum = a.attnum where a.attrelid in (${rels})
and a.attnum > 0 and not a.attisdropped order by a.attnum`)
    const keys: Array<Row> = yield sp.all(sql`select conrelid::text as rel,
conname as name, contype::text as type, pg_get_constraintdef(oid) as def from
pg_constraint where conrelid in (${rels}) and contype in ('p', 'u') order by
conname`)
    const indexes: Array<Row> = yield sp.all(sql`select x.indrelid::text as
rel, i.relname as name, x.indisunique as "unique", pg_get_indexdef(x.indexrelid)
as def from pg_index x join pg_class i on i.oid = x.indexrelid where
x.indrelid in (${rels}) and not exists (select 1 from pg_constraint where
conindid = x.indexrelid and conrelid = x.indrelid) order by i.relname`)
    const fks: Array<Row> = yield sp.all(sql`select conrelid::text as rel,
conname as name, a.attname as column, rn.nspname as schema, r.relname as
table, ra.attname as reference, confupdtype::text as "onUpdate",
confdeltype::text as "onDelete" from pg_constraint join pg_class r on r.oid =
confrelid join pg_namespace rn on rn.oid = r.relnamespace cross join lateral
unnest(conkey, confkey) with ordinality as k(num, ref, pos) join pg_attribute
a on a.attrelid = conrelid and a.attnum = k.num join pg_attribute ra on
ra.attrelid = confrelid and ra.attnum = k.ref where conrelid in (${rels}) and
contype = 'f' order by conname, k.pos`)
    const own = (rows: Array<Row>, rel: string) =>
      rows.filter(row => row.rel === rel)
    return tables.map(({rel, name}) => ({
      name,
      columns: own(columns, rel),
      keys: own(keys, rel),
      indexes: own(indexes, rel),
      fks: own(fks, rel)
    }))
  })
}
