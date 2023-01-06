import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, table} from '../src'
import {connect} from './DbSuite'

const User = table({
  name: 'User',
  columns: {
    id: column.integer().primaryKey(),
    name: column.string()
  }
})

test('Transaction', async () => {
  const query = await connect()
  // For the current drivers we just want to check here that the connection
  // stays locked during the transaction. Once we add pooled drivers the
  // transaction should run on an isolated connection and then this test stops
  // making sense.
  const [_, bob] = await Promise.all([
    query.transaction(async function (query) {
      await query(User.createTable())
      await query(User.insertOne({name: 'Alice'}))
      await query(User.insertOne({name: 'Bob'}))
    }),
    query(User.first().where(User.name.is('Bob')))
  ])
  assert.equal(bob?.name, 'Bob')
})

test('Rollback', async () => {
  const query = await connect()
  await query(User.createTable())
  await query
    .transaction(async function (query) {
      await query(User.insertOne({name: 'Bob'}))
      throw new Error('Rollback')
    })
    .catch(() => {})
  const bob = await query(User.first().where(User.name.is('Bob')))
  assert.is(bob, undefined)
})

test('Savepoints', async () => {
  const query = await connect()
  await query(User.createTable())
  await query.transaction(async function (query) {
    await query(User.insertOne({name: 'Bob'}))

    await query
      .transaction(async function (query) {
        await query(User.insertOne({name: 'Ted'}))
        throw new Error('Rollback')
      })
      .catch(() => {})

    await query(User.insertOne({name: 'Alice'}))
  })
  const users = await query(User)
  assert.equal(users, [
    {id: 1, name: 'Bob'},
    {id: 2, name: 'Alice'}
  ])
})

test.run()
