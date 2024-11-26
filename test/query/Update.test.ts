import {sql, table} from '@/index.ts'
import {QueryBuilder} from '@/postgres/builder.ts'
import {integer, json} from '@/sqlite/columns.ts'
import {suite} from '@alinea/suite'
import {Functions} from '../../src/core/expr/Functions.ts'
import {builder, emit} from '../TestUtils.ts'

suite(import.meta, test => {
  const definition = {
    id: integer().primaryKey(),
    withDefault: integer().default(2),
    required: integer().notNull(),
    nullable: integer(),
    data: json()
  }

  const Node = table('Node', definition)

  test('update', () => {
    const query = builder.update(Node).set({
      nullable: null,
      required: 3,
      withDefault: sql<number>`${Node.required} + 1`
    })
    test.equal(
      emit(query),
      'update "Node" set "nullable" = null, "required" = 3, "withDefault" = "required" + 1'
    )
  })

  test('update with function', () => {
    const query = builder.update(Node).set({
      data: Functions.json_patch(Node.data, {a: 1})
    })
    test.equal(
      emit(query),
      'update "Node" set "data" = "json_patch"("data", {"a":1})'
    )
  })

  test('returning', () => {
    const query = new QueryBuilder()
      .update(Node)
      .set({required: 3})
      .returning(Node.id)
    test.equal(emit(query), 'update "Node" set "required" = 3 returning "id"')
  })
})
