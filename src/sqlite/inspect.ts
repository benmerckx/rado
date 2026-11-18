import type {Database} from '../core/Database.ts'
import {
  type ForeignKey,
  type Inspect,
  type Schema,
  type Table,
  createInspect
} from '../core/Inspect.ts'
import type {Gen} from '../core/Push.ts'
import {sql} from '../core/Sql.ts'
import {type Row, catalog} from './catalog.ts'

export type * from '../core/Inspect.ts'

// The column list of an index and the text after it, split on top level
// commas outside quotes. Quoted names before the list can hold parentheses
function split(text: string): {list: Array<string>; rest: string} {
  const list: Array<string> = []
  let depth = -1
  let quote = ''
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quote) {
      if (char === quote) quote = ''
    } else if (`'"\`[`.includes(char)) quote = char === '[' ? ']' : char
    else if (char === '(') {
      if (!++depth) start = i + 1
    } else if (char === ')' && depth) depth--
    else if (!depth && (char === ',' || char === ')')) {
      // Sort order is left out, as pragma_index_info leaves it out of names
      list.push(
        text
          .slice(start, i)
          .trim()
          .replace(/\s+(asc|desc)$/i, '')
      )
      start = i + 1
      if (char === ')') return {list, rest: text.slice(i + 1)}
    }
  }
  return {list, rest: ''}
}

// The expression of a generated column, from the table's create statement
function generation(table: string, name: string): string | undefined {
  const lower = name.toLowerCase()
  const definition = split(table).list.find(part =>
    [lower, `"${lower}"`, `\`${lower}\``, `[${lower}]`].some(head =>
      part.toLowerCase().startsWith(`${head} `)
    )
  )
  const at = definition?.search(/\bas\s*\(/i) ?? -1
  return at < 0 ? undefined : split(definition!.slice(at)).list[0]
}

function* read(tx: Database, schema = 'main'): Gen<Schema> {
  const rows = yield* catalog(tx, schema)
  const tables = rows.map((table): Table => {
    const groups = Map.groupBy(table.keys, (key: Row) => key.name)
    const keys = [...groups].map(([name, rows]) => ({
      name,
      origin: rows[0].origin,
      unique: Boolean(rows[0].unique),
      columns: rows.map(row => row.col)
    }))
    const {primary, increments} = table
    const fks = Map.groupBy(table.fks, (fk: Row) => fk.id)
    return {
      schema,
      name: table.name,
      // Hidden columns are generated ones, virtual tables aren't listed
      columns: table.columns.map(row => {
        const generated =
          row.hidden && generation(table.sql[table.name], row.name)
        return {
          name: row.name,
          type: row.type,
          notNull: Boolean(row.notnull),
          default: row.dflt_value,
          autoIncrement: increments && primary[0] === row.name,
          ...(generated ? {generated} : {})
        }
      }),
      ...(primary.length ? {primaryKey: {columns: primary}} : {}),
      uniques: keys
        .filter(key => key.origin === 'u')
        .map(({columns}) => ({columns})),
      indexes: keys
        .filter(key => key.origin === 'c')
        .map(({name, unique, columns}) => {
          const definition = table.sql[name]
          const {list, rest} = split(definition)
          const where = rest.match(/^\s*where\s+([\s\S]*)$/i)?.[1]
          return {
            name,
            unique,
            columns: columns.map((column, i) => column ?? list[i]),
            ...(where ? {where} : {}),
            definition
          }
        }),
      foreignKeys: [...fks.values()].map(
        (rows): ForeignKey => ({
          columns: rows.map(row => row.from),
          schema,
          table: rows[0].table,
          references: rows.map(row => row.to ?? ''),
          onDelete: rows[0].on_delete,
          onUpdate: rows[0].on_update
        })
      )
    }
  })
  const views: Array<Row> = yield tx.all(
    sql`select name, sql from ${sql.identifier(
      schema
    )}.sqlite_master where type = 'view' order by rowid`
  )
  return {
    tables,
    views: views.map(row => ({schema, name: row.name, definition: row.sql}))
  }
}

export const inspect: Inspect<'sqlite'> = createInspect('sqlite', read)
