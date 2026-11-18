import {own} from '../core/Catalog.ts'
import type {Database} from '../core/Database.ts'
import {and, eq, inArray, isNotNull} from '../core/expr/Conditions.ts'
import {schema as define} from '../core/Schema.ts'
import {type Sql, sql} from '../core/Sql.ts'
import type {Table} from '../core/Table.ts'
import type {Gen} from '../core/Transaction.ts'
import {int, text} from './columns.ts'

const system = define('information_schema')

const scope = {table_schema: text().notNull(), table_name: text().notNull()}

export const Tables = system.table('tables', {
  ...scope,
  table_type: text().notNull()
})

export const Columns = system.table('columns', {
  ...scope,
  column_name: text().notNull(),
  column_type: text().notNull(),
  is_nullable: text().notNull(),
  column_default: text(),
  extra: text().notNull(),
  generation_expression: text(),
  ordinal_position: int().notNull()
})

export const Statistics = system.table('statistics', {
  ...scope,
  index_name: text().notNull(),
  column_name: text(),
  non_unique: int().notNull(),
  collation: text(),
  sub_part: int(),
  expression: text(),
  index_type: text().notNull(),
  seq_in_index: int().notNull()
})

export const Usage = system.table('key_column_usage', {
  ...scope,
  constraint_schema: text().notNull(),
  constraint_name: text().notNull(),
  column_name: text().notNull(),
  ordinal_position: int().notNull(),
  // Nullable, but only read for foreign keys, where they are set
  referenced_table_schema: text().notNull(),
  referenced_table_name: text().notNull(),
  referenced_column_name: text().notNull()
})

export const Rules = system.table('referential_constraints', {
  constraint_schema: text().notNull(),
  constraint_name: text().notNull(),
  table_name: text().notNull(),
  update_rule: text().notNull(),
  delete_rule: text().notNull()
})

export const Views = system.table('views', {
  ...scope,
  view_definition: text().notNull()
})

export function* home(tx: Database): Gen<string> {
  const [name] = yield* tx.select(sql<string>`database()`)
  return name
}

// A key part as an index definition writes it
export function part(key: Key, column = key.column ?? ''): Sql {
  const desc = key.collation === 'D' && sql`desc`
  if (key.expression)
    return sql.join([sql`(${sql.unsafe(key.expression)})`, desc])
  const length = key.subPart ? sql`(${sql.inline(key.subPart)})` : sql``
  return sql.join([sql`${sql.identifier(column)}${length}`, desc])
}

function* query(tx: Database, schema: string, names?: Array<string>) {
  const where = (table: Table<typeof scope>) =>
    and(
      eq(table.table_schema, schema),
      names && inArray(table.table_name, names)
    )
  const tables = yield* tx
    .select(Tables.table_name)
    .from(Tables)
    .where(where(Tables), eq(Tables.table_type, 'BASE TABLE'))
    .orderBy(Tables.table_name)
  const columns = yield* tx
    .select({
      table: Columns.table_name,
      name: Columns.column_name,
      type: Columns.column_type,
      notNull: eq(Columns.is_nullable, 'NO'),
      value: Columns.column_default,
      extra: Columns.extra,
      generated: Columns.generation_expression
    })
    .from(Columns)
    .where(where(Columns))
    .orderBy(Columns.ordinal_position)
  const keys = yield* tx
    .select({
      table: Statistics.table_name,
      name: Statistics.index_name,
      column: Statistics.column_name,
      unique: eq(Statistics.non_unique, 0),
      collation: Statistics.collation,
      subPart: Statistics.sub_part,
      expression: Statistics.expression,
      kind: Statistics.index_type
    })
    .from(Statistics)
    .where(where(Statistics))
    .orderBy(Statistics.index_name, Statistics.seq_in_index)
  const foreignKeys = yield* tx
    .select({
      table: Usage.table_name,
      name: Usage.constraint_name,
      column: Usage.column_name,
      schema: Usage.referenced_table_schema,
      target: Usage.referenced_table_name,
      reference: Usage.referenced_column_name,
      onUpdate: Rules.update_rule,
      onDelete: Rules.delete_rule
    })
    .from(Usage)
    .innerJoin(
      Rules,
      and(
        eq(Rules.constraint_schema, Usage.constraint_schema),
        eq(Rules.constraint_name, Usage.constraint_name),
        eq(Rules.table_name, Usage.table_name)
      )
    )
    .where(where(Usage), isNotNull(Usage.referenced_table_name))
    .orderBy(Usage.constraint_name, Usage.ordinal_position)
  return {tables, columns, keys, foreignKeys}
}

type Rows = ReturnType<typeof query> extends Gen<infer T> ? T : never
export type Key = Rows['keys'][number]

export interface Entry {
  name: string
  columns: Rows['columns']
  keys: Array<Key>
  foreignKeys: Rows['foreignKeys']
}

// One query per kind of object, for every table at once
export function* catalog(
  tx: Database,
  schema: string,
  names?: Array<string>
): Gen<Array<Entry>> {
  const rows = yield* query(tx, schema, names)
  return rows.tables.map(name => ({
    name,
    columns: own(rows.columns, name),
    keys: own(rows.keys, name),
    foreignKeys: own(rows.foreignKeys, name)
  }))
}
