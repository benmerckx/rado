import {Assert, Test} from '@sinclair/carbon'
import {table} from '../../src/core/Table.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {builder, emit} from '../TestUtils.ts'

Test.describe('Drop', () => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  Test.it('drop table', () => {
    const query = builder.dropTable(Node)
    Assert.isEqual(emit(query), 'drop table "Node"')
  })

  Test.it('if not exists', () => {
    const query = builder.dropTable(Node).ifExists()
    Assert.isEqual(emit(query), 'drop table if exists "Node"')
  })
})
