import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column} from '../src'
import {table} from '../src/Table'
import {connect} from './DbSuite'

const User = table({
  name: 'user',
  columns: {
    id: column.integer().primaryKey(),
    name: column.object<{given: string; last: string}>(),
    email: column.string().nullable(),
    roles: column.array<string>().nullable()
  }
})
type User = table.infer<typeof User>

test('Update', async () => {
  const query = await connect()
  await query(User.createTable())
  const user = await query(
    User.insertOne({
      name: {
        given: 'abc',
        last: 'test'
      }
    })
  )
  const res = await query(
    User.set({
      email: 'test'
    }).where(User.id.is(user.id))
  )
  assert.is(res.rowsAffected, 1)
  assert.is((await query(User.first()))!.email, 'test')
  const res2 = await query(
    User.set({
      email: User.email.concat('@example.com')
    }).where(User.id.is(user.id))
  )
  assert.is(res2.rowsAffected, 1)
  assert.is((await query(User.first()))!.email, 'test@example.com')
  const res3 = await query(
    User.set({
      name: {
        given: 'def',
        last: 'okay'
      }
    }).where(User.id.is(user.id))
  )
  assert.is(res3.rowsAffected, 1)
  assert.is((await query(User.first()))!.name.given, 'def')
})

test('Update object', async () => {
  const query = await connect()
  await query(User.createTable())
  const user = await query(
    User.insertOne({
      name: {
        given: 'abc',
        last: 'test'
      }
    })
  )
  const res = await query(
    User.set({
      name: {
        given: '123',
        last: '456'
      }
    }).where(User.id.is(user.id))
  )
  assert.is(res.rowsAffected, 1)
  const user2 = (await query(User.where(User.id.is(user.id)).first()))!
  assert.is(user2.name.given, '123')
  assert.is(user2.name.last, '456')
})

test('Update array', async () => {
  const query = await connect()
  await query(User.createTable())
  const user = await query(
    User.insertOne({
      name: {
        given: 'abc',
        last: 'test'
      }
    })
  )
  const res = await query(
    User.set({
      roles: ['a', 'b']
    }).where(User.id.is(user.id))
  )
  assert.is(res.rowsAffected, 1)
  const user2 = (await query(User.first().where(User.id.is(user.id))))!
  assert.equal(user2.roles, ['a', 'b'])
})

test.run()
