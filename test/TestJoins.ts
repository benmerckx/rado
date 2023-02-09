import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {Id, column, create, table} from '../src/index'
import {connect} from './DbSuite'

type User = table<typeof User>
const User = table({
  User: class {
    id = column.integer().primaryKey<'User'>()
    name = column.string()
  }
})

type Contact = table<typeof Contact>
const Contact = table({
  Contact: class {
    id = column.integer().primaryKey<'Contact'>()
    user = column.integer<Id<User>>()
  }
})

test('Joins', async () => {
  const query = await connect()
  await query.transaction(async query => {
    await query(create(User, Contact))
    const user1 = await query(User().insertOne({name: 'b'}))
    const user2 = await query(User().insertOne({name: 'a'}))
    await query(Contact().insertAll([{user: user1.id}, {user: user2.id}]))
  })
  const results = await query(
    Contact()
      .leftJoin(User({id: Contact.user}))
      .select({...Contact, user: User})
      .orderBy(User.name)
  )
  assert.is(results[0].user.name, 'a')
  assert.is(results[1].user.name, 'b')
})

test.run()
