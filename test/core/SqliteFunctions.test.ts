import {suite} from '@benmerckx/suite'
import {table} from '../../src/core/Table.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {bm25, cast} from '../../src/sqlite/SqliteFunctions.ts'
import {emit} from '../TestUtils.ts'

suite(import.meta, test => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  test('eq', () => {
    test.equal(emit(bm25(Node, 1, 2)), '"bm25"("Node", 1, 2)')
  })

  test('cast', () => {
    test.equal(emit(cast(123, 'text')), 'cast(123 as "text")')
  })
})
