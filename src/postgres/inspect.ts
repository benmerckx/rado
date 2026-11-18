import {call} from '../core/Call.ts'
import {references} from '../core/Catalog.ts'
import type {Database} from '../core/Database.ts'
import {and, eq, inArray} from '../core/expr/Conditions.ts'
import {
  type Action,
  type ConstraintInfo,
  type Inspect,
  type SchemaInfo,
  type TableInfo,
  createInspect
} from '../core/Inspect.ts'
import {sql} from '../core/Sql.ts'
import {alias, table} from '../core/Table.ts'
import {type Gen, scratch} from '../core/Transaction.ts'
import {
  Attribute,
  Class,
  Constraint,
  type Entry,
  Index,
  Owner,
  Space,
  Views,
  catalog,
  home,
  prepend,
  scope
} from './catalog.ts'
import {integer} from './columns.ts'
import {actions} from './shape.ts'

export type * from '../core/Inspect.ts'

const Series = table('generate_series', {k: integer().notNull()})

// Key and index columns, push doesn't read them
function* parts(tx: Database, schema: string) {
  yield* prepend(tx, schema)
  const where = scope(schema)
  const space = eq(Space.oid, Owner.relnamespace)
  const Key = alias(Constraint, 'c')
  const Column = alias(Attribute, 'a')
  const keys = yield* tx
    .select({name: Key.conname, column: Column.attname})
    .from(Key)
    .innerJoin(Owner, eq(Owner.oid, Key.conrelid))
    .innerJoin(Space, space)
    .innerJoin(
      Column,
      and(
        eq(Column.attrelid, Key.conrelid),
        sql<boolean>`${Column.attnum} = any(${Key.conkey})`
      )
    )
    .where(where, inArray(Key.contype, ['p', 'u']))
    .orderBy(Key.conname, sql`array_position(${Key.conkey}, ${Column.attnum})`)
  const Entry = alias(Index, 'x')
  const Named = alias(Class, 'i')
  const k = call(Series, 'k', sql.inline(1), Entry.indnkeyatts)
  const indexes = yield* tx
    .select({
      name: Named.relname,
      column: sql<string>`coalesce(
        ${Column.attname},
        pg_get_indexdef(${Entry.indexrelid}, ${k.k}, true)
      )`
    })
    .from(Entry)
    .innerJoin(Owner, eq(Owner.oid, Entry.indrelid))
    .innerJoin(Space, space)
    .innerJoin(Named, eq(Named.oid, Entry.indexrelid))
    .crossJoin(k)
    .leftJoin(
      Column,
      and(
        eq(Column.attrelid, Entry.indrelid),
        sql<boolean>`${Column.attnum} = ${Entry.indkey}[${k.k} - 1]`
      )
    )
    .where(where)
    .orderBy(Named.relname, k.k)
  const names = (rows: Array<{name: string; column: string}>) =>
    Map.groupBy(rows, row => row.name)
  return {keys: names(keys), indexes: names(indexes)}
}

type Parts = ReturnType<typeof parts> extends Gen<infer T> ? T : never

function info(schema: string, entry: Entry, parts: Parts): TableInfo {
  const columns = (map: Map<string, Array<{column: string}>>, name: string) =>
    map.get(name)!.map(row => row.column)
  const action = (code: string) => actions[code].toUpperCase() as Action
  const constraint = (key: Entry['keys'][number]): ConstraintInfo => ({
    name: key.name,
    columns: columns(parts.keys, key.name),
    definition: key.definition
  })
  const primary = entry.keys.find(key => key.primary)
  return {
    schema,
    name: entry.name,
    // A generated column's expression is stored as its default
    columns: entry.columns.map(column => ({
      name: column.name,
      type: column.type,
      notNull: column.notNull,
      default: column.generated ? null : column.default,
      autoIncrement:
        Boolean(column.identity) ||
        Boolean(column.default?.startsWith('nextval(')),
      ...(column.generated ? {generated: column.default!} : {})
    })),
    ...(primary && {primaryKey: constraint(primary)}),
    uniques: entry.keys.filter(key => !key.primary).map(constraint),
    indexes: entry.indexes.map(index => {
      const where = index.definition.match(/ WHERE (.*)$/)?.[1]
      return {
        name: index.name,
        unique: index.unique,
        columns: columns(parts.indexes, index.name),
        ...(where ? {where} : {}),
        definition: index.definition
      }
    }),
    foreignKeys: references(entry.foreignKeys).map(key => ({
      ...key,
      schema: key.schema!,
      onDelete: action(key.onDelete),
      onUpdate: action(key.onUpdate)
    }))
  }
}

// Reads in a savepoint, as the search path is set for it
function read(db: Database, given?: string): Gen<SchemaInfo> {
  return scratch(db, function* (tx) {
    const schema = given ?? (yield* home(tx))
    const entries = yield* catalog(tx, schema)
    const keys = yield* scratch(tx, inner => parts(inner, schema))
    const views = yield* tx
      .select({
        name: Views.viewname,
        definition: sql<string>`format(
          'create view %I.%I as%s',
          ${Views.schemaname},
          ${Views.viewname},
          ${Views.definition}
        )`
      })
      .from(Views)
      .where(eq(Views.schemaname, schema))
      .orderBy(Views.viewname)
    return {
      tables: entries.map(entry => info(schema, entry, keys)),
      views: views.map(view => ({schema, ...view}))
    }
  })
}

export const inspect: Inspect<'postgres'> = createInspect('postgres', read)
