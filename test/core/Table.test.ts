import {table} from '../../src/core/Table.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {emit} from '../TestUtils.ts'
import {suite} from '../suite.ts'

suite(import.meta, ({test, isEqual}) => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  test('format table and column name', () => {
    isEqual(emit(Node.id), '"Node"."id"')
  })
})
