import type {HasSql} from './core/Internal.ts'
import type {Sql} from './core/Sql.ts'
import type {Table, TableDefinition, TableFields} from './core/Table.ts'

export type {
  InsertRow as InferInsertModel,
  SelectRow as InferSelectModel
} from './core/Table.ts'

export type SQL<T = unknown> = Sql<T>
export type SQLWrapper<T = unknown> = HasSql<T>
export function getTableColumns<Definition extends TableDefinition>(
  table: Table<Definition>
): TableFields<Definition> {
  return table
}

export {Rollback as TransactionRollbackError} from './core/Database.ts'
