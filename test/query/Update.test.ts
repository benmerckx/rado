import {sql, table} from '@/index.ts'
import {QueryBuilder} from '@/postgres/builder.ts'
import {integer} from '@/sqlite/columns.ts'
import {suite} from '@alinea/suite'
import {builder, emit} from '../TestUtils.ts'

suite(import.meta, test => {
  const definition = {
    id: integer().primaryKey(),
    withDefault: integer().default(2),
    required: integer().notNull(),
    nullable: integer()
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

  test('returning', () => {
    const query = new QueryBuilder()
      .update(Node)
      .set({required: 3})
      .returning(Node.id)
    test.equal(emit(query), 'update "Node" set "required" = 3 returning "id"')
  })
})
