import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column} from '../src'
import {collection} from '../src/Collection'
import {connect} from './DbSuite'

const User = collection({
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

test.run()
