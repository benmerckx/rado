import type {Database} from '../core/Database.ts'
import {
  type Constraint,
  type Inspect,
  type Schema,
  type Table,
  createInspect
} from '../core/Inspect.ts'
import type {Gen} from '../core/Push.ts'
import {sql} from '../core/Sql.ts'
import {type Row, catalog} from './catalog.ts'
import {actions} from './info.ts'

export type * from '../core/Inspect.ts'

// Column names as a constraint definition lists them, unquoted
function listed(def: string): Array<string> {
  return def
    .slice(def.indexOf('(') + 1, def.indexOf(')'))
    .split(', ')
    .map(name =>
      name.startsWith('"') ? name.slice(1, -1).replaceAll('""', '"') : name
    )
}

function* read(tx: Database, given?: string): Gen<Schema> {
  const schema: string =
    given ?? ((yield tx.get(sql`select current_schema() as name`)) as Row).name
  const rows = yield* catalog(tx, schema)
  const action = (code: string) => actions[code].toUpperCase()
  const tables = rows.map((table): Table => {
    const constraint = (row: Row): Constraint & {name: string} => ({
      name: row.name,
      columns: listed(row.def),
      definition: row.def
    })
    const primary = table.keys.find(row => row.type === 'p')
    const indexes = Map.groupBy(table.indexes, (row: Row) => row.name)
    const fks = Map.groupBy(table.fks, (row: Row) => row.name)
    return {
      schema,
      name: table.name,
      columns: table.columns.map(row => ({
        name: row.name,
        type: row.type,
        notNull: row.notNull,
        default: row.default,
        autoIncrement:
          Boolean(row.identity) || Boolean(row.default?.startsWith('nextval('))
      })),
      ...(primary ? {primaryKey: constraint(primary)} : {}),
      uniques: table.keys.filter(row => row.type === 'u').map(constraint),
      indexes: [...indexes].map(([name, rows]) => {
        const where = rows[0].def.match(/ WHERE (.*)$/)?.[1]
        return {
          name,
          unique: rows[0].unique,
          columns: rows.map(row => row.col),
          ...(where ? {where} : {}),
          definition: rows[0].def
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
    sql`select viewname as name, definition from pg_views where schemaname = ${schema} order by viewname`
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
