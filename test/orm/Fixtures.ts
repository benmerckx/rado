import {table} from '#/core/Table.ts'
import {many, one, primaryKey} from '#/index.ts'
import {boolean, id, integer, text} from '#/universal.ts'

export const users = table('user', {
  id: id(),
  name: text().notNull(),
  email: text(),
  loginCount: integer().notNull().default(0)
})

export const posts = table('post', {
  id: id(),
  authorId: integer()
    .notNull()
    .references(() => users.id),
  title: text().notNull(),
  published: boolean().notNull().default(false)
})

export const comments = table('comment', {
  id: id(),
  postId: integer()
    .notNull()
    .references(() => posts.id),
  body: text().notNull()
})

export const tags = table('tag', {
  id: id(),
  name: text().notNull()
})

export const postTags = table(
  'post_tag',
  {
    postId: integer()
      .notNull()
      .references(() => posts.id),
    tagId: integer()
      .notNull()
      .references(() => tags.id)
  },
  self => [primaryKey(self.postId, self.tagId)]
)

export const Post = {
  ...posts,
  author: one(users, {from: posts.authorId, to: users.id}),
  comments: many(comments, {from: posts.id, to: comments.postId}),
  tags: many(tags, {
    from: posts.id,
    to: tags.id,
    through: {table: postTags, from: postTags.postId, to: postTags.tagId}
  })
}

export const User = {
  ...users,
  posts: many(posts, {from: users.id, to: posts.authorId})
}

export const UserGraph = {
  ...users,
  posts: many(Post, {from: users.id, to: posts.authorId})
}

export async function createDb() {
  const {'bun:sqlite': connect} = await import('#/driver.ts')
  const {Database} = await import('bun:sqlite')
  const db = connect(new Database(':memory:'))
  await db.create(users, posts, comments, tags, postTags)
  return db
}
