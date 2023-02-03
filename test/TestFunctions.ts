import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {Expr, Functions, column, from, select, table} from '../src/index'
import {cast, count, strftime} from '../src/sqlite'
import {connect} from './DbSuite'

test('dynamic', async () => {
  const query = await connect()
  const {json_patch} = Functions
  const patched = await query(select(json_patch({a: 1}, {a: 0, b: 2})).sure())
  assert.equal(patched, {a: 0, b: 2})
})

test('Functions', async () => {
  const query = await connect()
  const User = table({
    name: 'User',
    columns: {
      id: column.integer().primaryKey(),
      birthdate: column.string()
    }
  })
  await query(User.createTable())
  const now = '1920-01-01'
  const int = (e: Expr<any>) => cast(e, 'integer')
  const age: Expr<number> = int(strftime('%Y', now))
    .substract(int(strftime('%Y', User.birthdate)))
    .substract(
      int(strftime('%m-%d', now).isLess(strftime('%m-%d', User.birthdate)))
    )
  const me = await query(User.insertOne({birthdate: '1900-01-01'}))
  assert.is(
    (await query(User.sure().select({age}).where(User.id.is(me.id)))).age,
    20
  )
  assert.is(
    await query(
      from(User.where(User.id.is(me.id)))
        .select(count())
        .first()
    ),
    1
  )
})

test.run()
