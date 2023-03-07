import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, table} from '../src/index'
import {connect} from './DbSuite'

const User = table({
  User: {
    id: column.integer().primaryKey(),
    name: column.string()
  }
})

test('Transaction', async () => {
  const db = await connect()
  // For the current drivers we just want to check here that the connection
  // stays locked during the transaction. Once we add pooled drivers the
  // transaction should run on an isolated connection and then this test stops
  // making sense.
  const [_, bob] = await Promise.all([
    db.transaction(async function (query) {
      return User()
        .create()
        .next(User().insertOne({name: 'Alice'}))
        .next(User().insertOne({name: 'Bob'}))
        .on(query)
    }),
    db(User().maybeFirst().where(User.name.is('Bob')))
  ])
  assert.equal(bob?.name, 'Bob')
})

test('Rollback', async () => {
  const query = await connect()
  await query(User().create())
  await query
    .transaction(async function (query) {
      await query(User().insertOne({name: 'Bob'}))
      throw new Error('Rollback')
    })
    .catch(() => {})
  const bob = await query(User().maybeFirst().where(User.name.is('Bob')))
  assert.is(bob, null)
})

test('Savepoints', async () => {
  const query = await connect()
  await query(User().create())
  await query.transaction(async function (query) {
    await query(User().insertOne({name: 'Bob'}))

    await query
      .transaction(async function (query) {
        await query(User().insertOne({name: 'Ted'}))
        throw new Error('Rollback')
      })
      .catch(() => {})

    await query(User().insertOne({name: 'Alice'}))
  })
  const users = await query(User())
  assert.equal(users, [
    {id: 1, name: 'Bob'},
    {id: 2, name: 'Alice'}
  ])
})

test.run()
