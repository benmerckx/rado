import {suite} from '@alinea/suite'
import {table} from '#/core/Table.ts'
import {desc, eq, many, one, sql} from '#/index.ts'
import {boolean, id, integer, text} from '#/universal.ts'

const users = table('user', {
  id: id(),
  name: text().notNull(),
  email: text(),
  loginCount: integer().notNull().default(0),
  invitedBy: integer().references((): any => users.id)
})

const posts = table('post', {
  id: id(),
  authorId: integer()
    .notNull()
    .references(() => users.id),
  title: text().notNull(),
  published: boolean().notNull().default(false)
})

const comments = table('comment', {
  id: id(),
  postId: integer()
    .notNull()
    .references(() => posts.id),
  authorId: integer()
    .notNull()
    .references(() => users.id),
  body: text().notNull()
})

const groups = table('group', {
  id: id(),
  name: text().notNull()
})

const Post = {
  ...posts,
  author: one(users, {from: posts.authorId, to: users.id}),
  comments: many(comments, {
    from: posts.id,
    to: comments.postId
  })
}

async function createDb() {
  const {'bun:sqlite': connect} = await import('#/driver.ts')
  const {Database} = await import('bun:sqlite')
  const db = connect(new Database(':memory:'))
  await db.create(users, posts, comments, groups)
  return db
}

const test = suite(import.meta)

test('first finds a row by primary key', async () => {
  const db = await createDb()
  const saved = await db.insert(users).values({name: 'Ada'})
  const found = await db.first(Post)
})
