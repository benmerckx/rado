import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column} from '../src'
import {collection} from '../src/Collection'
import {connect} from './DbSuite'

const User = collection({
  name: 'user',
  columns: {
    id: column.integer().primaryKey(),
    name: column.object<{given: string; last: string}>(),
    email: column.string().nullable(),
    roles: column.array<string>().nullable()
  }
})
type User = collection.infer<typeof User>

test('Update', () => {
  const query = connect()
  query(User.createTable())
  const user = query(
    User.insertOne({
      name: {
        given: 'abc',
        last: 'test'
      }
    })
  )
  const res = query(
    User.set({
      email: 'test'
    }).where(User.id.is(user.id))
  )
  assert.is(res.rowsAffected, 1)
  assert.is(query(User.first())!.email, 'test')
  const res2 = query(
    User.set({
      email: User.email.concat('@example.com')
    }).where(User.id.is(user.id))
  )
  assert.is(res2.rowsAffected, 1)
  assert.is(query(User.first())!.email, 'test@example.com')
  const res3 = query(
    User.set({
      name: {
        given: 'def',
        last: 'okay'
      }
    }).where(User.id.is(user.id))
  )
  assert.is(res3.rowsAffected, 1)
  assert.is(query(User.first())!.name.given, 'def')
})

test('Update object', () => {
  const query = connect()
  query(User.createTable())
  const user = query(
    User.insertOne({
      name: {
        given: 'abc',
        last: 'test'
      }
    })
  )
  const res = query(
    User.set({
      name: {
        given: '123',
        last: '456'
      }
    }).where(User.id.is(user.id))
  )
  assert.is(res.rowsAffected, 1)
  const user2 = query(User.where(User.id.is(user.id)).first())!
  assert.is(user2.name.given, '123')
  assert.is(user2.name.last, '456')
})

test('Update array', () => {
  const query = connect()
  query(User.createTable())
  const user = query(
    User.insertOne({
      name: {
        given: 'abc',
        last: 'test'
      }
    })
  )
  const res = query(
    User.set({
      roles: ['a', 'b']
    }).where(User.id.is(user.id))
  )
  assert.is(res.rowsAffected, 1)
  const user2 = query(User.first().where(User.id.is(user.id)))!
  assert.equal(user2.roles, ['a', 'b'])
})

test.run()
