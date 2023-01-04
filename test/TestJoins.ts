import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, create} from '../src'
import {collection} from '../src/Collection'
import {connect} from './DbSuite'

type User = collection.infer<typeof User>
const User = collection({
  name: 'User',
  columns: {
    id: column.integer().primaryKey(),
    name: column.string()
  }
})

type Contact = collection.infer<typeof Contact>
const Contact = collection({
  name: 'Contact',
  columns: {
    id: column.integer().primaryKey(),
    user: column.integer()
  }
})

test('OrderBy', () => {
  const query = connect()
  query(create(User, Contact))
  const user1 = query(User.insertOne({name: 'b'}))
  const user2 = query(User.insertOne({name: 'a'}))
  console.log({user1, user2})
  const contact1 = query(Contact.insertOne({user: user1.id}))
  const contact2 = query(Contact.insertOne({user: user2.id}))
  const results = query(
    Contact.leftJoin(User, User.id.is(Contact.user))
      .select({...Contact, user: User})
      .orderBy(User.name.asc())
  )
  console.log(results)
  assert.is(results[0].user.name, 'a')
  assert.is(results[1].user.name, 'b')
})

test.run()
