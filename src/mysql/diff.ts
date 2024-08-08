import type {Diff} from '../core/Diff.ts'
import type {HasSql} from '../core/Internal.ts'
import type {Table} from '../core/Table.ts'
import {mysqlDialect} from './dialect.ts'

const inline = (sql: HasSql) => mysqlDialect.inline(sql)

export const mysqlDiff: Diff = (hasTable: Table) => {
  throw new Error('Diffing for MySQL is not yet implemented')
}
