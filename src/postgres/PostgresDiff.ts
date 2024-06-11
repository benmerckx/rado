import {getTable, type HasSql} from '../core/Internal.ts'
import {sql} from '../core/Sql.ts'
import {table, type Table} from '../core/Table.ts'
import {and, eq, gt, not} from '../core/expr/Conditions.ts'
import type {Diff} from '../migrate/Diff.ts'
import {txGenerator} from '../universal.ts'
import * as column from './PostgresColumns.ts'
import {postgresDialect} from './PostgresDialect.ts'

const PgAttribute = table('pg_attribute', {
  attname: column.text().notNull(),
  atttypid: column.oid().notNull(),
  atttypmod: column.integer().notNull(),
  attnotnull: column.boolean().notNull(),
  attrelid: column.oid().notNull(),
  attisdropped: column.boolean().notNull(),
  attnum: column.integer().notNull(),
  attidentity: column.text()
})

// Next, see:
// https://github.com/beekeeper-studio/beekeeper-studio/blob/5ea27af9a3508f509f6913b07766a1c744443fae/apps/studio/src/lib/db/clients/postgresql/scripts.ts#L4

const inline = (sql: HasSql) => postgresDialect.inline(sql)

export const postgresDiff: Diff = (hasTable: Table) => {
  return txGenerator(function* (tx) {
    const tableApi = getTable(hasTable)
    const columnInfo = yield* tx
      .select({
        name: PgAttribute.attname,
        type: sql<string>`format_type(${PgAttribute.atttypid}, ${PgAttribute.atttypmod}) || attidentity`,
        notNull: PgAttribute.attnotnull
      })
      .from(PgAttribute)
      .where(
        and(
          eq(
            PgAttribute.attrelid,
            sql`quote_ident(${sql.inline(`${tableApi.name}`)})::regclass`
          ),
          gt(PgAttribute.attnum, 0),
          not(PgAttribute.attisdropped)
        )
      )
      .orderBy(PgAttribute.attnum)
    const localColumns = new Map(
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
    console.log(localColumns)
    return []
  })
}
