import {own} from '../core/Catalog.ts'
import {column} from '../core/Column.ts'
import type {Database} from '../core/Database.ts'
import {and, eq, exists, gt, inArray, not} from '../core/expr/Conditions.ts'
import {schema as define} from '../core/Schema.ts'
import {sql} from '../core/Sql.ts'
import {alias} from '../core/Table.ts'
import {type Gen, scratch} from '../core/Transaction.ts'
import {PgColumn, boolean, integer, oid, text} from './columns.ts'

const system = define('pg_catalog')

const numbers = () =>
  new PgColumn<Array<number>>({type: column.int2vector()}).notNull()

export const Class = system.table('pg_class', {
  oid: oid().notNull(),
  relname: text().notNull(),
  relnamespace: oid().notNull(),
  relkind: text().notNull()
})

export const Namespace = system.table('pg_namespace', {
  oid: oid().notNull(),
  nspname: text().notNull()
})

export const Type = system.table('pg_type', {
  typname: text().notNull(),
  typnamespace: oid().notNull(),
  typtype: text().notNull()
})

export const Attribute = system.table('pg_attribute', {
  attrelid: oid().notNull(),
  attname: text().notNull(),
  atttypid: oid().notNull(),
  atttypmod: integer().notNull(),
  attnum: integer().notNull(),
  attnotnull: boolean().notNull(),
  attisdropped: boolean().notNull(),
  attidentity: text().notNull(),
  attgenerated: text().notNull()
})

export const Default = system.table('pg_attrdef', {
  adrelid: oid().notNull(),
  adnum: integer().notNull(),
  adbin: text().notNull()
})

export const Constraint = system.table('pg_constraint', {
  oid: oid().notNull(),
  conname: text().notNull(),
  contype: text().notNull(),
  conrelid: oid().notNull(),
  confrelid: oid().notNull(),
  conindid: oid().notNull(),
  conkey: numbers(),
  confkey: numbers(),
  confupdtype: text().notNull(),
  confdeltype: text().notNull()
})

export const Index = system.table('pg_index', {
  indexrelid: oid().notNull(),
  indrelid: oid().notNull(),
  indisunique: boolean().notNull(),
  indnkeyatts: integer().notNull(),
  indkey: numbers()
})

export const Views = system.table('pg_views', {
  schemaname: text().notNull(),
  viewname: text().notNull(),
  definition: text().notNull()
})

// The table a row belongs to and its schema
export const Owner = alias(Class, 'owner')
export const Space = alias(Namespace, 'space')

export function* home(tx: Database): Gen<string> {
  const [name] = yield* tx.select(sql<string>`current_schema()`)
  return name
}

// Puts a schema first in the search path until the transaction ends
export function* prepend(tx: Database, schema: string): Gen<void> {
  const current = sql<string>`current_setting('search_path')`
  const path = sql<string>`quote_ident(${schema}::text) || ', ' || ${current}`
  yield* tx.select(sql<string>`set_config('search_path', ${path}, true)`)
}

// The tables of a schema, or some of them, joined as owner and space
export function scope(schema: string, names?: Array<string>) {
  return and(
    eq(Space.nspname, schema),
    inArray(Owner.relkind, ['r', 'p']),
    names && inArray(Owner.relname, names)
  )
}

function* query(tx: Database, schema: string, names?: Array<string>) {
  yield* prepend(tx, schema)
  const where = scope(schema, names)
  const space = eq(Space.oid, Owner.relnamespace)
  const tables = yield* tx
    .select(Owner.relname)
    .from(Owner)
    .innerJoin(Space, space)
    .where(where)
    .orderBy(Owner.relname)
  const Column = alias(Attribute, 'a')
  const Value = alias(Default, 'd')
  const columns = yield* tx
    .select({
      table: Owner.relname,
      name: Column.attname,
      type: sql<string>`format_type(${Column.atttypid}, ${Column.atttypmod})`,
      notNull: Column.attnotnull,
      default: sql<
        string | null
      >`pg_get_expr(${Value.adbin}, ${Value.adrelid})`,
      identity: sql<string>`${Column.attidentity}::text`,
      generated: sql<string>`${Column.attgenerated}::text`
    })
    .from(Column)
    .innerJoin(Owner, eq(Owner.oid, Column.attrelid))
    .innerJoin(Space, space)
    .leftJoin(
      Value,
      and(eq(Value.adrelid, Column.attrelid), eq(Value.adnum, Column.attnum))
    )
    .where(where, gt(Column.attnum, 0), not(Column.attisdropped))
    .orderBy(Column.attnum)
  const Key = alias(Constraint, 'k')
  const keys = yield* tx
    .select({
      table: Owner.relname,
      name: Key.conname,
      primary: eq(Key.contype, 'p'),
      definition: sql<string>`pg_get_constraintdef(${Key.oid})`
    })
    .from(Key)
    .innerJoin(Owner, eq(Owner.oid, Key.conrelid))
    .innerJoin(Space, space)
    .where(where, inArray(Key.contype, ['p', 'u']))
    .orderBy(Key.conname)
  const Entry = alias(Index, 'x')
  const Named = alias(Class, 'i')
  const indexes = yield* tx
    .select({
      table: Owner.relname,
      name: Named.relname,
      unique: Entry.indisunique,
      definition: sql<string>`pg_get_indexdef(${Entry.indexrelid})`
    })
    .from(Entry)
    .innerJoin(Owner, eq(Owner.oid, Entry.indrelid))
    .innerJoin(Space, space)
    .innerJoin(Named, eq(Named.oid, Entry.indexrelid))
    .where(
      where,
      not(
        exists(
          tx
            .select(sql`1`)
            .from(Key)
            .where(
              eq(Key.conindid, Entry.indexrelid),
              eq(Key.conrelid, Entry.indrelid)
            )
        )
      )
    )
    .orderBy(Named.relname)
  const Target = alias(Class, 'target')
  const Home = alias(Namespace, 'home')
  const Reference = alias(Attribute, 'r')
  const position = sql`array_position(${Key.conkey}, ${Column.attnum})`
  const foreignKeys = yield* tx
    .select({
      table: Owner.relname,
      name: Key.conname,
      column: Column.attname,
      schema: Home.nspname,
      target: Target.relname,
      reference: Reference.attname,
      onUpdate: sql<string>`${Key.confupdtype}::text`,
      onDelete: sql<string>`${Key.confdeltype}::text`
    })
    .from(Key)
    .innerJoin(Owner, eq(Owner.oid, Key.conrelid))
    .innerJoin(Space, space)
    .innerJoin(Target, eq(Target.oid, Key.confrelid))
    .innerJoin(Home, eq(Home.oid, Target.relnamespace))
    .innerJoin(
      Column,
      and(
        eq(Column.attrelid, Key.conrelid),
        sql<boolean>`${Column.attnum} = any(${Key.conkey})`
      )
    )
    .innerJoin(
      Reference,
      and(
        eq(Reference.attrelid, Key.confrelid),
        sql<boolean>`${Reference.attnum} = ${Key.confkey}[${position}]`
      )
    )
    .where(where, eq(Key.contype, 'f'))
    .orderBy(Key.conname, position)
  return {tables, columns, keys, indexes, foreignKeys}
}

type Rows = ReturnType<typeof query> extends Gen<infer T> ? T : never

export interface Entry {
  name: string
  columns: Rows['columns']
  keys: Rows['keys']
  indexes: Rows['indexes']
  foreignKeys: Rows['foreignKeys']
}

// One query per kind of object, for every table at once. Read with the
// schema first in the search path, so names in types and defaults print
// the same for a table and its scratch copy
export function* catalog(
  tx: Database,
  schema: string,
  names?: Array<string>
): Gen<Array<Entry>> {
  const rows = yield* scratch(tx, inner => query(inner, schema, names))
  return rows.tables.map(name => ({
    name,
    columns: own(rows.columns, name),
    keys: own(rows.keys, name),
    indexes: own(rows.indexes, name),
    foreignKeys: own(rows.foreignKeys, name)
  }))
}
