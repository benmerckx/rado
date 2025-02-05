import {table} from '@/index.ts'
import {integer} from '@/sqlite/columns.ts'
import {bm25, cast} from '@/sqlite/functions.ts'
import {suite} from '@alinea/suite'
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
