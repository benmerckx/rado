import type {Database} from '../core/Database.ts'
import {
  type Inspect,
  type Schema,
  type Table,
  createInspect
} from '../core/Inspect.ts'
import type {Gen} from '../core/Push.ts'
import {sql} from '../core/Sql.ts'
import {type Row, catalog} from './catalog.ts'
import {quote} from './info.ts'

export type * from '../core/Inspect.ts'

function* read(tx: Database, given?: string): Gen<Schema> {
  const schema: string =
    given ?? ((yield tx.get(sql`select database() as name`)) as Row).name
  const rows = yield* catalog(tx, schema)
  const tables = rows.map((table): Table => {
    const keys = [...Map.groupBy(table.keys, (row: Row) => row.name)]
    const primary = keys.find(([name]) => name === 'PRIMARY')
    const fks = Map.groupBy(table.fks, (row: Row) => row.name)
    return {
      schema,
      name: table.name,
      columns: table.columns.map(row => ({
        name: row.name,
        type: row.type,
        notNull: row.nullable === 'NO',
        // Literal defaults are stored as their value, expressions as text
        default:
          row.value === null || /default_generated/i.test(row.extra)
            ? row.value
            : `'${row.value.replaceAll("'", "''")}'`,
        autoIncrement: /auto_increment/i.test(row.extra)
      })),
      ...(primary
        ? {
            primaryKey: {
              name: 'PRIMARY',
              columns: primary[1].map(row => row.column)
            }
          }
        : {}),
      // MySQL makes no difference between unique constraints and unique
      // indexes, both are listed as indexes
      uniques: [],
      indexes: keys
        .filter(([name]) => name !== 'PRIMARY')
        .map(([name, rows]) => {
          const unique = Number(rows[0].non_unique) === 0
          const parts = rows.map(
            row =>
              (row.expression
                ? `(${row.expression})`
                : quote(row.column) +
                  (row.sub_part ? `(${row.sub_part})` : '')) +
              (row.collation === 'D' ? ' desc' : '')
          )
          return {
            name,
            unique,
            columns: rows.map(row => row.expression ?? row.column),
            definition: `create ${unique ? 'unique ' : ''}index ${quote(
              name
            )} on ${quote(table.name)} (${parts.join(', ')})`
          }
        }),
      foreignKeys: [...fks].map(([name, rows]) => ({
        name,
        columns: rows.map(row => row.column),
        schema: rows[0].ref_schema,
        table: rows[0].ref_table,
        references: rows.map(row => row.ref_column),
        onDelete: rows[0].on_delete,
        onUpdate: rows[0].on_update
      }))
    }
  })
  const views: Array<Row> = yield tx.all(
    sql`select table_name as name, view_definition as definition from information_schema.views where table_schema = ${schema} order by table_name`
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

export const inspect: Inspect<'mysql'> = createInspect('mysql', read)
