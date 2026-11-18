import type {Database} from '../core/Database.ts'
import {
  type Action,
  type Constraint,
  type Inspect,
  type Schema,
  type Table,
  createInspect
} from '../core/Inspect.ts'
import {type Gen, scratch} from '../core/Push.ts'
import {sql} from '../core/Sql.ts'
import {type Row, catalog, prepend, relations} from './catalog.ts'
import {actions} from './info.ts'

export type * from '../core/Inspect.ts'

function* read(tx: Database, given?: string): Gen<Schema> {
  const schema: string =
    given ?? ((yield tx.get(sql`select current_schema() as name`)) as Row).name
  const rows = yield* catalog(tx, schema)
  // Key and index columns, push doesn't read them
  const [keyColumns, indexColumns] = yield* scratch(tx, function* (sp): Gen<
    Array<Map<string, Array<Row>>>
  > {
    yield* prepend(sp, schema)
    const rels = relations(schema)
    const keys: Array<Row> = yield sp.all(sql`select c.conname as name,
a.attname as col from pg_constraint c cross join unnest(c.conkey) with
ordinality k(n, i) join pg_attribute a on a.attrelid = c.conrelid and
a.attnum = k.n where c.conrelid in (${rels}) and c.contype in ('p', 'u')
order by c.conname, k.i`)
    const indexes: Array<Row> = yield sp.all(sql`select i.relname as name,
coalesce(a.attname, pg_get_indexdef(x.indexrelid, k.n, true)) as col from
pg_index x join pg_class i on i.oid = x.indexrelid cross join
generate_series(1, x.indnkeyatts) k(n) left join pg_attribute a on
a.attrelid = x.indrelid and a.attnum = x.indkey[k.n - 1] where x.indrelid in
(${rels}) order by i.relname, k.n`)
    const named = (rows: Array<Row>) =>
      Map.groupBy(rows, (row: Row) => row.name)
    return [named(keys), named(indexes)]
  })
  const cols = (map: Map<string, Array<Row>>, name: string) =>
    map.get(name)!.map(row => row.col)
  const action = (code: string) => actions[code].toUpperCase() as Action
  const tables = rows.map((table): Table => {
    const constraint = (row: Row): Constraint => ({
      name: row.name,
      columns: cols(keyColumns, row.name),
      definition: row.def
    })
    const primary = table.keys.find(row => row.type === 'p')
    const fks = Map.groupBy(table.fks, (row: Row) => row.name)
    return {
      schema,
      name: table.name,
      // A generated column's expression is stored as its default
      columns: table.columns.map(row => ({
        name: row.name,
        type: row.type,
        notNull: row.notNull,
        default: row.generated ? null : row.default,
        autoIncrement:
          Boolean(row.identity) || Boolean(row.default?.startsWith('nextval(')),
        ...(row.generated ? {generated: row.default} : {})
      })),
      ...(primary ? {primaryKey: constraint(primary)} : {}),
      uniques: table.keys.filter(row => row.type === 'u').map(constraint),
      indexes: table.indexes.map(row => {
        const where = row.def.match(/ WHERE (.*)$/)?.[1]
        return {
          name: row.name,
          unique: row.unique,
          columns: cols(indexColumns, row.name),
          ...(where ? {where} : {}),
          definition: row.def
        }
      }),
      foreignKeys: [...fks].map(([name, rows]) => ({
        name,
        columns: rows.map(row => row.column),
        schema: rows[0].schema,
        table: rows[0].table,
        references: rows.map(row => row.reference),
        onDelete: action(rows[0].onDelete),
        onUpdate: action(rows[0].onUpdate)
      }))
    }
  })
  const views: Array<Row> = yield tx.all(
    sql`select viewname as name, format('create view %I.%I as%s', schemaname, viewname, definition) as definition from pg_views where schemaname = ${schema} order by viewname`
  )
  return {
    tables,
    views: views.map(row => ({
      schema,
      name: row.name,
      definition: row.definition
    }))
  }
}

export const inspect: Inspect<'postgres'> = createInspect(
  'postgres',
  read,
  true
)
