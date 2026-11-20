import {references} from '../core/Catalog.ts'
import type {Database} from '../core/Database.ts'
import {eq} from '../core/expr/Conditions.ts'
import {
  type Action,
  type Inspect,
  type SchemaInfo,
  type TableInfo,
  createInspect
} from '../core/Inspect.ts'
import type {Gen} from '../core/Transaction.ts'
import {type Entry, Master, catalog} from './catalog.ts'

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

function info(schema: string, entry: Entry): TableInfo {
  const keys = [...Map.groupBy(entry.keys, key => key.name)].map(
    ([name, parts]) => ({
      name,
      origin: parts[0].origin,
      unique: parts[0].unique,
      columns: parts.map(part => part.column)
    })
  )
  const {primary, increments} = entry
  const create = entry.sql[entry.name]
  return {
    schema,
    name: entry.name,
    // Hidden columns are generated ones, virtual tables aren't listed
    columns: entry.columns.map(column => {
      const generated = column.hidden && generation(create, column.name)
      return {
        name: column.name,
        type: column.type,
        notNull: column.notNull,
        default: column.value,
        autoIncrement: increments && primary[0] === column.name,
        ...(generated ? {generated} : {})
      }
    }),
    ...(primary.length ? {primaryKey: {columns: primary}} : {}),
    uniques: keys
      .filter(key => key.origin === 'u')
      .map(({columns}) => ({columns: columns.map(column => column ?? '')})),
    indexes: keys
      .filter(key => key.origin === 'c')
      .map(({name, unique, columns}) => {
        const definition = entry.sql[name]
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
    foreignKeys: references(entry.foreignKeys).map(key => ({
      columns: key.columns,
      schema,
      table: key.table,
      references: key.references,
      onDelete: key.onDelete as Action,
      onUpdate: key.onUpdate as Action
    }))
  }
}

function* read(tx: Database, schema = 'main'): Gen<SchemaInfo> {
  const entries = yield* catalog(tx, schema)
  const master = Master(schema, 'm')
  const views = yield* tx
    .select({name: master.name, definition: master.sql})
    .from(master)
    .where(eq(master.type, 'view'))
    .orderBy(master.rowid)
  return {
    tables: entries.map(entry => info(schema, entry)),
    views: views.map(view => ({
      schema,
      name: view.name,
      definition: view.definition ?? ''
    }))
  }
}

export const inspect: Inspect<'sqlite'> = createInspect('sqlite', read)
