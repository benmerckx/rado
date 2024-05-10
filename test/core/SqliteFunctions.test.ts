import {table} from '../../src/core/Table.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {bm25, cast} from '../../src/sqlite/SqliteFunctions.ts'
import {emit} from '../TestUtils.ts'
import {suite} from '../suite.ts'

suite(import.meta, ({test, isEqual}) => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  test('eq', () => {
    isEqual(emit(bm25(Node, 1, 2)), '"bm25"("Node", 1, 2)')
  })

  test('cast', () => {
    isEqual(emit(cast(123, 'text')), 'cast(123 as "text")')
  })
})
