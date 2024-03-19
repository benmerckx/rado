import {TableDefinition, table} from '../core/Table.ts'

export function sqliteTable<Definition extends TableDefinition>(
  name: string,
  columns: Definition
) {
  return table(name, columns)
}
