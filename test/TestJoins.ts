import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column} from '../src'
import {collection} from '../src/Collection'
import {createConnection} from './DbSuite'

type Entry = collection.infer<typeof Entry>
const Entry = collection({
  name: 'Entry',
  columns: {
    id: column.string(),
    type: column.string(),
    num: column.number()
  }
})

type User = collection.infer<typeof User>
const User = collection({
  name: 'User',
  columns: {
    id: column.string(),
    name: column.string()
  }
})

type Contact = collection.infer<typeof Contact>
const Contact = collection({
  name: 'Contact',
  columns: {
    id: column.string(),
    user: column.string()
  }
})

test('OrderBy', () => {
  const query = createConnection()
  const user1 = query(User.insertOne({name: 'b'}))
  const user2 = query(User.insertOne({name: 'a'}))
  const contact1 = db.insert(Contact, {user: user1.id})
  const contact2 = db.insert(Contact, {user: user2.id})
  const results = db.all(
    Contact.leftJoin(User, User.id.is(Contact.user))
      .select(Contact.with({user: User.fields}))
      .orderBy(User.name.asc())
  )
  assert.is(results[0].user.name, 'a')
  assert.is(results[1].user.name, 'b')
})

test('Cursor joins', () => {
  const db = store()
  const Entry = collection<Entry>('Entry')
  const Type1 = collection<Entry>('Entry', {
    where: Entry.as('Type1').type.is('Type1'),
    alias: 'Type1'
  })
  const Type2 = collection<Entry>('Entry', {
    where: Entry.as('Type2').type.is('Type2'),
    alias: 'Type2'
  })
  db.insert(Entry, {type: 'Type1', num: 1})
  db.insert(Entry, {type: 'Type2', num: 1})
  db.insert(Entry, {type: 'Type3', num: 1})
  const res = db.first(
    Type1.leftJoin(Type2, Type1.num.is(Type2.num)).select(
      Type1.fields.with({
        linked: Type2.fields
      })
    )
  )!
  assert.is(res.linked.type, 'Type2')
})

test.run()
