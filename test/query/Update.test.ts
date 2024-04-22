import {Assert, Test} from '@sinclair/carbon'
import {sql} from '../../src/core/Sql.ts'
import {table} from '../../src/core/Table.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {builder, emit} from '../TestUtils.ts'

Test.describe('Update', () => {
  const definition = {
    id: integer().primaryKey(),
    withDefault: integer().default(2),
    required: integer().notNull(),
    nullable: integer()
  }

  const Node = table('Node', definition)

  Test.it('update', () => {
    const query = builder.update(Node).set({
      nullable: null,
      required: 3,
      withDefault: sql<number>`${Node.required} + 1`
    })
    Assert.isEqual(
      emit(query),
      'update "Node" set "nullable" = null, "required" = 3, "withDefault" = "required" + 1'
    )
  })
})
