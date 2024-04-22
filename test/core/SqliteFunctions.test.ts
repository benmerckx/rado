import {Assert, Test} from '@sinclair/carbon'
import {table} from '../../src/core/Table.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {bm25, cast} from '../../src/sqlite/SqliteFunctions.ts'
import {emit} from '../TestUtils.ts'

Test.describe('SqliteFunctions', () => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  Test.it('eq', () => {
    Assert.isEqual(emit(bm25(Node, 1, 2)), '"bm25"("Node", 1, 2)')
  })

  Test.it('cast', () => {
    Assert.isEqual(emit(cast(123, 'text')), 'cast(123 as "text")')
  })
})
