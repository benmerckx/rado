import type {HasSql} from '../core/Internal.ts'
import type {Table} from '../core/Table.ts'
import type {Diff} from '../migrate/Diff.ts'
import {mysqlDialect} from './MysqlDialect.ts'

const inline = (sql: HasSql) => mysqlDialect.inline(sql)

export const mysqlDiff: Diff = (hasTable: Table) => {
  throw new Error('Diffing for MySQL is not yet implemented')
}
