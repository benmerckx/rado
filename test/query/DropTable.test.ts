import {table} from '../../src/core/Table.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {suite} from '../Suite.ts'
import {builder, emit} from '../TestUtils.ts'

suite(import.meta, ({test, isEqual}) => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  test('drop table', () => {
    const query = builder.dropTable(Node)
    isEqual(emit(query), 'drop table "Node"')
  })

  test('if not exists', () => {
    const query = builder.dropTable(Node).ifExists()
    isEqual(emit(query), 'drop table if exists "Node"')
  })
})
