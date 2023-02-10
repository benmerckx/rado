import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, table} from '../src/index'
import {connect} from './DbSuite'

const User = table({
  User: class {
    id = column.integer().primaryKey<'user'>()
    name = column.object<{given: string; last: string}>()
    booleanValue = column.boolean().defaultValue(false)
    email = column.string().nullable()
    roles = column.array<string[]>().nullable()
    deep = column.array<{prop: number}[]>().defaultValue([])
  }
})
type User = table<typeof User>

test('Update', async () => {
  const query = await connect()
  await query(User().create())
  const user = await query(
    User().insertOne({
      name: {
        given: 'abc',
        last: 'test'
      }
    })
  )
  const res = await query(
    User({id: user.id}).set({
      email: 'test'
    })
  )
  assert.is(res.rowsAffected, 1)
  assert.is((await query(User().first())).email, 'test')
  const res2 = await query(
    User({id: user.id}).set({
      email: User.email.concat('@example.com')
    })
  )
  assert.is(res2.rowsAffected, 1)
  assert.is((await query(User().first())).email, 'test@example.com')
  const res3 = await query(
    User({id: user.id}).set({
      name: {
        given: 'def',
        last: 'okay'
      }
    })
  )
  assert.is(res3.rowsAffected, 1)
  assert.is((await query(User().first())).name.given, 'def')

  await User().set({booleanValue: true}).on(query)
  assert.is((await User().first().on(query)).booleanValue, true)
})

test('Update object', async () => {
  const query = await connect()
  await query(User().create())
  const user = await query(
    User().insertOne({
      name: {
        given: 'abc',
        last: 'test'
      }
    })
  )
  const res = await query(
    User({id: user.id}).set({
      name: {
        given: '123',
        last: '456'
      }
    })
  )
  assert.is(res.rowsAffected, 1)
  const user2 = await query(User({id: user.id}).first())
  assert.is(user2.name.given, '123')
  assert.is(user2.name.last, '456')
})

test('Update array', async () => {
  const query = await connect()
  await query(User().create())
  const user = await query(
    User().insertOne({
      name: {
        given: 'abc',
        last: 'test'
      }
    })
  )
  const res = await query(
    User({id: user.id}).set({
      roles: ['a', 'b'],
      deep: [{prop: 1}]
    })
  )
  assert.is(res.rowsAffected, 1)
  const user2 = (await query(User().maybeFirst().where(User.id.is(user.id))))!
  assert.equal(user2.roles, ['a', 'b'])
  assert.equal(user2.deep, [{prop: 1}])
})

test.run()
