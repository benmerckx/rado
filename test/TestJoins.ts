import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, create} from '../src'
import {table} from '../src/Table'
import {connect} from './DbSuite'

type User = table.infer<typeof User>
const User = table({
  name: 'User',
  columns: {
    id: column.integer().primaryKey(),
    name: column.string()
  }
})

type Contact = table.infer<typeof Contact>
const Contact = table({
  name: 'Contact',
  columns: {
    id: column.integer().primaryKey(),
    user: column.integer()
  }
})

test('OrderBy', async () => {
  const query = await connect()
  await query(create(User, Contact))
  const user1 = await query(User.insertOne({name: 'b'}))
  const user2 = await query(User.insertOne({name: 'a'}))
  const contact1 = await query(Contact.insertOne({user: user1.id}))
  const contact2 = await query(Contact.insertOne({user: user2.id}))
  const results = await query(
    Contact.leftJoin(User, User.id.is(Contact.user))
      .select({...Contact, user: User})
      .orderBy(User.name.asc())
  )
  assert.is(results[0].user.name, 'a')
  assert.is(results[1].user.name, 'b')
})

test.run()
