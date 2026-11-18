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
// commas outside quotes
function split(text: string): {list: Array<string>; rest: string} {
  const list: Array<string> = []
  let depth = 0
  let quote = ''
  let start = text.indexOf('(') + 1
  for (let i = start; i < text.length; i++) {
    const char = text[i]
    if (quote) {
      if (char === quote) quote = ''
    } else if (`'"\`[`.includes(char)) quote = char === '[' ? ']' : char
    else if (char === '(') depth++
    else if (char === ',' && !depth) {
      list.push(text.slice(start, i).trim())
      start = i + 1
    } else if (char === ')' && !depth--) {
      list.push(text.slice(start, i).trim())
      return {list, rest: text.slice(i + 1)}
    }
  }
  return {list, rest: ''}
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
    const primary = table.columns
      .filter(row => row.pk > 0)
      .toSorted((a, b) => a.pk - b.pk)
      .map(row => row.name)
    const increments = /\bautoincrement\b/i.test(
      table.sql[table.name].replace(/'([^']|'')*'/g, '')
    )
    const fks = Map.groupBy(table.fks, (fk: Row) => fk.id)
    return {
      schema,
      name: table.name,
      columns: table.columns.map(row => ({
        name: row.name,
        type: row.type,
        notNull: Boolean(row.notnull),
        default: row.dflt_value,
        autoIncrement: increments && primary[0] === row.name
      })),
      ...(primary.length ? {primaryKey: {columns: primary}} : {}),
      uniques: keys
        .filter(key => key.origin === 'u')
        .map(({name, columns}) => ({name, columns})),
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
