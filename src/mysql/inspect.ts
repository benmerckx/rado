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
import {sql} from '../core/Sql.ts'
import type {Gen} from '../core/Transaction.ts'
import {type Entry, Views, catalog, home, part} from './catalog.ts'

export type * from '../core/Inspect.ts'

// Expressions are stored with their quotes and backslashes escaped
function unescape(text: string): string {
  return text.replace(/\\(.)/g, '$1')
}

// Literal defaults are stored as their value, expressions as text: bit and
// hex literals and numbers of non-string types read as they are
function literal({
  value,
  type,
  extra
}: Entry['columns'][number]): string | null {
  if (value === null) return null
  if (/default_generated/i.test(extra)) return unescape(value)
  if (
    /^(b'|0x)/i.test(value) ||
    (!/char|text|blob|binary|enum|set|json/i.test(type) &&
      /^-?[\d.]+(e[-+]?\d+)?$/i.test(value))
  )
    return value
  return `'${value.replaceAll("'", "''")}'`
}

// The expression a column takes on update, from its extra information
function onUpdate(extra: string): {onUpdate?: string} {
  const value = extra.match(/\bon update (.+)$/i)?.[1]
  return value ? {onUpdate: value} : {}
}

function table(tx: Database, schema: string, entry: Entry): TableInfo {
  const keys = Map.groupBy(
    entry.keys.map(key =>
      key.expression ? {...key, expression: unescape(key.expression)} : key
    ),
    key => key.name
  )
  const primary = keys.get('PRIMARY')
  keys.delete('PRIMARY')
  return {
    schema,
    name: entry.name,
    columns: entry.columns.map(column => ({
      name: column.name,
      type: column.type,
      notNull: column.notNull,
      default: literal(column),
      autoIncrement: /auto_increment/i.test(column.extra),
      ...(column.generated ? {generated: unescape(column.generated)} : {}),
      ...onUpdate(column.extra)
    })),
    ...(primary && {
      primaryKey: {
        name: 'PRIMARY',
        columns: primary.map(key => key.column ?? '')
      }
    }),
    // MySQL makes no difference between unique constraints and unique
    // indexes, both are listed as indexes
    uniques: [],
    indexes: [...keys].map(([name, parts]) => {
      const [{unique, kind}] = parts
      // Fulltext and spatial indexes can't be recreated as plain ones
      const special = /^(fulltext|spatial)$/i.test(kind)
      const definition = sql.join([
        sql`create`,
        unique ? sql`unique` : special && sql.unsafe(kind.toLowerCase()),
        sql`index ${sql.identifier(name)}`,
        sql`on ${sql.identifier(entry.name)}`,
        sql`(${sql.join(
          parts.map(key => part(key)),
          sql`, `
        )})`
      ])
      return {
        name,
        unique,
        columns: parts.map(key => key.expression ?? key.column ?? ''),
        definition: tx.dialect.inline(definition)
      }
    }),
    foreignKeys: references(entry.foreignKeys).map(key => ({
      ...key,
      schema: key.schema ?? schema,
      onDelete: key.onDelete as Action,
      onUpdate: key.onUpdate as Action
    }))
  }
}

function* read(tx: Database, given?: string): Gen<SchemaInfo> {
  const schema = given ?? (yield* home(tx))
  const entries = yield* catalog(tx, schema)
  const views = yield* tx
    .select({name: Views.table_name, definition: Views.view_definition})
    .from(Views)
    .where(eq(Views.table_schema, schema))
    .orderBy(Views.table_name)
  return {
    tables: entries.map(entry => table(tx, schema, entry)),
    views: views.map(view => ({
      schema,
      name: view.name,
      definition: tx.dialect.inline(
        sql`create view ${sql.identifier(view.name)} as ${sql.unsafe(
          view.definition
        )}`
      )
    }))
  }
}

export const inspect: Inspect<'mysql'> = createInspect('mysql', read)
