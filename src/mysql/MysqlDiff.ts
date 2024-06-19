import {getTable, type HasSql} from '../core/Internal.ts'
import type {Table} from '../core/Table.ts'
import type {Diff} from '../migrate/Diff.ts'
import {txGenerator} from '../universal.ts'
import {mysqlDialect} from './MysqlDialect.ts'

const inline = (sql: HasSql) => mysqlDialect.inline(sql)

export const mysqlDiff: Diff = (hasTable: Table) => {
  return txGenerator(function* (tx) {
    const tableApi = getTable(hasTable)

    return []
  })
}
