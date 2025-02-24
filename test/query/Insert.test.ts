import type {Builder} from '@/core/Builder.ts'
import type {IsPostgres} from '@/core/MetaData.ts'
import {eq, table} from '@/index.ts'
import {integer} from '@/sqlite/columns.ts'
import {suite} from '@alinea/suite'
import {builder, emit} from '../TestUtils.ts'

suite(import.meta, test => {
  const definition = {
    id: integer().primaryKey(),
    withDefault: integer().default(2),
    required: integer().notNull(),
    nullable: integer(),
    withRuntimeDefault: integer().$default(5)
  }

  const Node = table('Node', definition)

  const query = (builder as Builder<IsPostgres>)
    .insert(Node)
    .values({id: 1, required: 3})

  test('insert into', () => {
    test.equal(
      emit(query),
      'insert into "Node" ("id", "withDefault", "required", "nullable", "withRuntimeDefault") values (1, default, 3, null, 5)'
    )
  })

  test('returning', () => {
    test.equal(
      emit(query.returning(Node.id)),
      'insert into "Node" ("id", "withDefault", "required", "nullable", "withRuntimeDefault") values (1, default, 3, null, 5) returning "id"'
    )
  })

  test('on conflict do nothing', () => {
    test.equal(
      emit(
        query.onConflictDoNothing({
          target: Node.id,
          targetWhere: eq(Node.id, 1)
        })
      ),
      'insert into "Node" ("id", "withDefault", "required", "nullable", "withRuntimeDefault") values (1, default, 3, null, 5) on conflict ("id") where "id" = 1 do nothing'
    )
  })

  test('on conflict do update', () => {
    test.equal(
      emit(
        query.onConflictDoUpdate({
          target: Node.id,
          set: {required: 4}
        })
      ),
      'insert into "Node" ("id", "withDefault", "required", "nullable", "withRuntimeDefault") values (1, default, 3, null, 5) on conflict ("id") do update set "required" = 4'
    )
  })
})
