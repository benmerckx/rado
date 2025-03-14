import {type BaseColumnData, formatColumn} from '../core/Column.ts'
import type {Diff} from '../core/Diff.ts'
import {type HasSql, getData, getTable} from '../core/Internal.ts'
import {type Sql, sql} from '../core/Sql.ts'
import {type Table, table} from '../core/Table.ts'
import {
  and,
  asc,
  eq,
  gt,
  isNotNull,
  isNull,
  like,
  not,
  or,
  when
} from '../core/expr/Conditions.ts'
import {concat, txGenerator} from '../universal.ts'
import * as column from './columns.ts'
import {postgresDialect} from './dialect.ts'

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

const columnType = sql<string>`pg_catalog.format_type(${Attr.typId}, ${Attr.typMod})`
const columnDefaultValue = when<string | null>(
  [Attr.hasDef, sql`pg_catalog.pg_get_expr(${AttrDef.bin}, ${AttrDef.relId})`],
  null
)
const identity = when<string | null>(
  [eq(Attr.identity, 'a'), sql`'generated always as identity'`],
  [eq(Attr.identity, 'd'), sql`'generated by default as identity'`],
  null
)

export const postgresDiff: Diff = (hasTable: Table) => {
  return txGenerator(function* (tx) {
    const tableApi = getTable(hasTable)
    const def = tx
      .select({
        table_name: Class.relname,
        name: Attr.name,
        type: columnType,
        notNull: Attr.notNull,
        defaultValue: columnDefaultValue,
        identity,
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
    const mapSequenceType = when(
      def.type,
      ['integer', 'serial'],
      ['smallint', 'smallserial'],
      ['bigint', 'bigserial'],
      def.type
    )
    const isSequence = like(def.defaultValue, 'nextval(%_seq%')
    const type = concat(
      when([isSequence, mapSequenceType], def.type),
      when(
        [isNotNull(def.identity), concat(' ', def.identity).inlineValues()],
        ''
      )
    ).inlineValues()
    const isNumeric = or(
      eq(def.type, 'integer'),
      eq(def.type, 'smallint'),
      eq(def.type, 'bigint')
    )
    const isNumericSequence = and(isSequence, isNumeric)
    const defaultValue = when(
      [
        and(isNotNull(def.defaultValue), not(isNumericSequence)),
        def.defaultValue
      ],
      ''
    )
    const columnInfo = yield* tx
      .select({
        name: def.name,
        type,
        notNull: and(def.notNull, isNull(def.identity)),
        defaultValue
      })
      .from(def)

    const localColumns = new Map<string, BaseColumnData>(
      columnInfo.map(column => {
        return [
          column.name,
          {
            type: sql.unsafe(column.type.toLowerCase()),
            notNull: column.notNull,
            defaultValue: column.defaultValue
              ? sql.unsafe(column.defaultValue)
              : undefined
          }
        ]
      })
    )

    const schemaColumns = new Map(
      Object.entries(tableApi.columns).map(([name, column]) => {
        const columnApi = getData(column)
        return [columnApi.name ?? name, columnApi]
      })
    )

    const stmts: Array<Sql> = []

    // Check if the columns are identical

    const columnNames = new Set([
      ...localColumns.keys(),
      ...schemaColumns.keys()
    ])

    for (const columnName of columnNames) {
      const alterTable = sql.identifier(tableApi.name)
      const column = sql.identifier(columnName)
      const localInstruction = localColumns.get(columnName)
      const schemaInstruction = schemaColumns.get(columnName)
      if (!schemaInstruction) {
        stmts.push(
          sql.query({
            alterTable,
            dropColumn: column
          })
        )
      } else if (!localInstruction) {
        stmts.push(
          sql.query({
            alterTable,
            addColumn: [column, formatColumn(schemaInstruction)]
          })
        )
      } else {
        if (inline(localInstruction.type) !== inline(schemaInstruction.type)) {
          stmts.push(
            sql.query({
              alterTable,
              alterColumn: [column, sql`type ${schemaInstruction.type}`]
            })
          )
        }
        if (
          Boolean(localInstruction.notNull) !==
          Boolean(schemaInstruction.notNull)
        ) {
          stmts.push(
            sql.query({
              alterTable,
              alterColumn: [
                column,
                schemaInstruction.notNull
                  ? sql`set not null`
                  : sql`drop not null`
              ]
            })
          )
        }
        const localDefault = localInstruction.defaultValue
        const schemaDefault = schemaInstruction.defaultValue
        const localDefaultStr = localDefault && inline(localDefault)
        const schemaDefaultStr = schemaDefault && inline(schemaDefault)
        if (localDefaultStr !== schemaDefaultStr) {
          stmts.push(
            sql.query({
              alterTable,
              alterColumn: [
                column,
                schemaDefault
                  ? sql`set default ${schemaDefault}`
                  : sql`drop default`
              ]
            })
          )
        }
      }
    }

    return stmts.map(inline)
  })
}
