import {test} from 'uvu'
import {column, table} from '../src'

const UserDef = table({
  name: 'User',
  columns: {
    id: column.integer().primaryKey<'User'>(),
    name: column.string()
  }
})
type User = table.infer<typeof UserDef>
const User = Object.assign(UserDef, {
  insertOne(post: Post) {}
})

const Post = table({
  name: 'Post',
  columns: {
    id: column.integer().primaryKey<'Post'>(),
    userId: column.integer(),
    title: column.string()
  }
})
type Post = table.infer<typeof Post>

test('Relations', async () => {})

test.run()
