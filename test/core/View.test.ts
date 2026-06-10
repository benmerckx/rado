import {suite} from '@alinea/suite'
import {sql} from '@/core/Sql.ts'
import {createView, dropView} from '@/core/View.ts'
import {integer, text} from '@/sqlite/columns.ts'
import {emit} from '../TestUtils.ts'

suite(import.meta, test => {
  test('create view', () => {
    const query = sql`select ${sql.identifier('id')} from ${sql.identifier(
      'users'
    )}`
    const statement = createView({name: 'user_view'}, query)
    test.equal(
      emit(statement),
      'create view "user_view" as select "id" from "users"'
    )
  })

  test('create view with schema and columns', () => {
    const query = sql`select ${sql.identifier('id')} as ${sql.identifier(
      'user_id'
    )}, ${sql.identifier('name')} from ${sql.identifier('users')}`
    const statement = createView(
      {
        name: 'user_view',
        schemaName: 'public',
        columns: {id: integer('user_id'), name: text()}
      },
      query
    )
    test.equal(
      emit(statement),
      'create view "public"."user_view" ("user_id", "name") as select "id" as "user_id", "name" from "users"'
    )
  })

  test('drop view', () => {
    const statement = dropView({name: 'user_view', schemaName: 'public'})
    test.equal(emit(statement), 'drop view if exists "public"."user_view"')
  })
})
