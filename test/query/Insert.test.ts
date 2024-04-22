import {Assert, Test} from '@sinclair/carbon'
import {table} from '../../src/core/Table.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {builder, emit} from '../TestUtils.ts'

Test.describe('Insert', () => {
  const definition = {
    id: integer().primaryKey(),
    withDefault: integer().default(2),
    required: integer().notNull(),
    nullable: integer()
  }

  const Node = table('Node', definition)

  const query = builder.insert(Node).values({id: 1, required: 3})

  Test.it('insert into', () => {
    Assert.isEqual(
      emit(query),
      'insert into "Node"("id", "withDefault", "required", "nullable") values (1, 2, 3, default)'
    )
  })

  Test.it('returning', () => {
    Assert.isEqual(
      emit(query.returning(Node.id)),
      'insert into "Node"("id", "withDefault", "required", "nullable") values (1, 2, 3, default) returning "id"'
    )
  })
})
