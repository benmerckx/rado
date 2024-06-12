import {getTable, type HasSql} from '../core/Internal.ts'
import {sql} from '../core/Sql.ts'
import {table, type Table} from '../core/Table.ts'
import {
  and,
  asc,
  eq,
  gt,
  isNotNull,
  like,
  ne,
  not,
  or,
  when
} from '../core/expr/Conditions.ts'
import type {Diff} from '../migrate/Diff.ts'
import {concat, txGenerator} from '../universal.ts'
import * as column from './PostgresColumns.ts'
import {postgresDialect} from './PostgresDialect.ts'

const Attr = table('pg_attribute', {
  name: column.text('attname').notNull(),
  typId: column.oid('atttypid').notNull(),
  typMod: column.integer('atttypmod').notNull(),
  notNull: column.boolean('attnotnull').notNull(),
  relId: column.oid('attrelid').notNull(),
  isDropped: column.boolean('attisdropped').notNull(),
  num: column.integer('attnum').notNull(),
  identity: column.text('attidentity'),
  hasDef: column.boolean('atthasdef').notNull()
})

const Class = table('pg_class', {
  oid: column.oid().notNull(),
  relname: column.text().notNull(),
  relnamespace: column.oid().notNull()
})

const Namespace = table('pg_namespace', {
  oid: column.oid().notNull(),
  name: column.text('nspname').notNull()
})

const Type = table('pg_type', {
  oid: column.oid().notNull(),
  name: column.text('typname').notNull()
})

const AttrDef = table('pg_attrdef', {
  relId: column.oid('adrelid').notNull(),
  num: column.integer('adnum').notNull(),
  bin: column.text('adbin').notNull()
})

const inline = (sql: HasSql) => postgresDialect.inline(sql)

export const postgresDiff: Diff = (hasTable: Table) => {
  return txGenerator(function* (tx) {
    const tableApi = getTable(hasTable)
    const def = tx
      .select({
        table_name: Class.relname,
        name: Attr.name,
        type: sql<string>`pg_catalog.format_type(${Attr.typId}, ${Attr.typMod})`,
        notNull: or(Attr.notNull, ne(Attr.identity, '')),
        defaultValue: when<string>([
          Attr.hasDef,
          sql`pg_catalog.pg_get_expr(${AttrDef.bin}, ${AttrDef.relId})`
        ]),
        identity: when<string>(
          [eq(Attr.identity, 'a'), sql`'generated always as identity'`],
          [eq(Attr.identity, 'd'), sql`'generated by default as identity'`]
        ),
        schema_name: Namespace.name
      })
      .from(Class)
      .innerJoin(Namespace, eq(Namespace.oid, Class.relnamespace))
      .innerJoin(Attr, and(gt(Attr.num, 0), eq(Attr.relId, Class.oid)))
      .innerJoin(Type, eq(Attr.typId, Type.oid))
      .leftJoin(
        AttrDef,
        and(eq(Attr.relId, AttrDef.relId), eq(Attr.num, AttrDef.num))
      )
      .where(eq(Class.relname, tableApi.name))
      .orderBy(asc(Attr.num))
      .as('def')
    const type = concat(
      when(
        [
          like(def.defaultValue, 'nextval(%_seq%'),
          when(
            def.type,
            ['integer', 'serial'],
            ['smallint', 'smallserial'],
            ['bigint', 'bigserial'],
            def.type
          )
        ],
        def.type
      ),
      when([isNotNull(def.identity), concat(' ', def.identity)], '')
    ).inlineValues()
    const isSequence = and(
      like(def.defaultValue, 'nextval(%_seq%'),
      or(
        eq(def.type, 'integer'),
        eq(def.type, 'smallint'),
        eq(def.type, 'bigint')
      )
    )
    const defaultValue = when(
      [and(isNotNull(def.defaultValue), not(isSequence)), def.defaultValue],
      ''
    ).inlineValues()
    const columnInfo = yield* tx
      .select({
        name: def.name,
        type,
        notNull: def.notNull,
        defaultValue
      })
      .from(def)
    console.log(columnInfo)
    /*const localColumns = new Map(
      columnInfo.map(column => {
        return [
          column.name,
          inline(
            sql.chunk('emitColumn', {
              type: sql.unsafe(column.type.toLowerCase()),
              notNull: column.notNull
            })
          )
        ]
      })
    )
    console.log(localColumns)*/
    return []
  })
}
