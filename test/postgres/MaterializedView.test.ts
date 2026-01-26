import {getCreate, getDrop} from '@/core/Internal.ts'
import {sql} from '@/core/Sql.ts'
import {integer, pgMaterializedView, text} from '@/postgres.ts'
import {suite} from '@alinea/suite'
import {emit} from '../TestUtils.ts'

suite(import.meta, test => {
  test('create/drop materialized view', () => {
    const query = sql`select ${sql.identifier('id')}, ${sql.identifier('name')} from ${sql.identifier('users')}`
    const view = pgMaterializedView('user_view', {
      id: integer('id'),
      name: text('name')
    }).as(query)

    test.equal(
      emit(getCreate(view)[0]),
      'create materialized view "user_view" ("id", "name") as select "id", "name" from "users"'
    )
    test.equal(
      emit(getDrop(view)[0]),
      'drop materialized view if exists "user_view"'
    )
  })
})
