import type {HasSql} from './core/Internal.ts'
import type {Sql} from './core/Sql.ts'
import type {
  Table,
  TableDefinition,
  TableFields,
  TableInsert,
  TableRow
} from './core/Table.ts'

export type InferSelectModel<T> = T extends Table<infer Definition>
  ? TableRow<Definition>
  : never
export type InferInsertModel<T> = T extends Table<infer Definition>
  ? TableInsert<Definition>
  : never
export type SQL<T = unknown> = Sql<T>
export type SQLWrapper<T = unknown> = HasSql<T>
export function getTableColumns<Definition extends TableDefinition>(
  table: Table<Definition>
): TableFields<Definition> {
  return table
}
export {Rollback as TransactionRollbackError} from './core/Database.ts'
