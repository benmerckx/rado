import {table} from '@/core/Table.ts'
import {integer} from '@/sqlite/columns.ts'
import {suite} from '@alinea/suite'
import {emit} from '../TestUtils.ts'

suite(import.meta, test => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  test('format table and column name', () => {
    test.equal(emit(Node.id), '"Node"."id"')
  })
})
