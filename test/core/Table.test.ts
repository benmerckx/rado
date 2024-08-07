import {suite} from '@benmerckx/suite'
import {table} from '../../src/core/Table.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {emit} from '../TestUtils.ts'

suite(import.meta, test => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  test('format table and column name', () => {
    test.equal(emit(Node.id), '"Node"."id"')
  })
})
