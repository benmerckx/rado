import {Assert, Test} from '@sinclair/carbon'
import type {Builder} from '../../src/core/Builder.ts'
import {table} from '../../src/core/Table.ts'
import {eq} from '../../src/index.ts'
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

  const query = (builder as Builder<{dialect: 'postgres'; mode: 'async'}>)
    .insert(Node)
    .values({id: 1, required: 3})

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

  Test.it('on conflict do nothing', () => {
    Assert.isEqual(
      emit(
        query.onConflictDoNothing({
          target: Node.id,
          targetWhere: eq(Node.id, 1)
        })
      ),
      'insert into "Node"("id", "withDefault", "required", "nullable") values (1, 2, 3, default) on conflict ("id") where "id" = 1 do nothing'
    )
  })

  Test.it('on conflict do update', () => {
    Assert.isEqual(
      emit(
        query.onConflictDoUpdate({
          target: Node.id,
          set: {required: 4}
        })
      ),
      'insert into "Node"("id", "withDefault", "required", "nullable") values (1, 2, 3, default) on conflict ("id") do update set "required" = 4'
    )
  })
})
