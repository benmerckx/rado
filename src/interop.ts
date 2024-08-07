import type {TableApi, TableInsert, TableRow} from './core/Table.ts'
export type InferSelectModel<Table> = Table extends TableApi<infer Definition>
  ? TableRow<Definition>
  : never
export type InferInsertModel<Table> = Table extends TableApi<infer Definition>
  ? TableInsert<Definition>
  : never
