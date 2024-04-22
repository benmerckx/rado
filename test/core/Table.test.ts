import {Assert, Test} from '@sinclair/carbon'
import {table} from '../../src/core/Table.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {emit} from '../TestUtils.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

Test.describe('Table', () => {
  Test.it('format table and column name', () => {
    Assert.isEqual(emit(Node.id), '"Node"."id"')
  })
})
