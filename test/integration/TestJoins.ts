import type {DefineTest} from '@alinea/suite'
import {alias, count, eq, type Database} from '#/index.ts'
import {lastInsertId} from '#/universal.ts'
import {Post, User} from './schema.ts'

export function testJoins(db: Database, test: DefineTest) {
  test('joins', async () => {
    try {
      await db.create(User, Post)
      await db.insert(User).values({name: 'Bob'})
      const user1 = await db.select(lastInsertId()).get()
      await db.insert(User).values({name: 'Mario'})
      const user2 = await db.select(lastInsertId()).get()
      await db.insert(Post).values({userId: user1!, title: 'Post 1'})
      const post1 = await db.select(lastInsertId()).get()
      await db.insert(Post).values({userId: user1!, title: 'Post 2'})
      const post2 = await db.select(lastInsertId()).get()
      const posts = await db.select().from(Post)
      test.equal(posts, [
        {id: post1, userId: user1, title: 'Post 1'},
        {id: post2, userId: user1, title: 'Post 2'}
      ])
      const userAndPosts = await db
        .select()
        .from(User)
        .innerJoin(Post, eq(Post.userId, User.id))
        .where(eq(User.id, user1))
      test.equal(userAndPosts, [
        {
          User: {id: user1, name: 'Bob'},
          Post: {id: post1, userId: user1, title: 'Post 1'}
        },
        {
          User: {id: user1, name: 'Bob'},
          Post: {id: post2, userId: user1, title: 'Post 2'}
        }
      ])

      const noPosts = await db
        .select()
        .from(User)
        .leftJoin(Post, eq(Post.userId, 42))
        .where(eq(User.id, user1))
      test.equal(noPosts, [
        {
          User: {id: user1, name: 'Bob'},
          Post: null
        }
      ])

      const rightJoin = await db
        .select()
        .from(Post)
        .rightJoin(User, eq(User.id, Post.userId))
        .where(eq(User.id, user2))

      test.equal(rightJoin, [
        {
          Post: null,
          User: {id: 2, name: 'Mario'}
        }
      ])
    } finally {
      await db.drop(User, Post)
    }
  })

  test('selected table stays itself after a join', async () => {
    try {
      await db.create(User, Post)
      await db.insert(User).values({name: 'Bob'})
      const id = (await db.select(User.id).from(User).get())!
      await db.insert(Post).values({userId: id, title: 'Post 1'})
      const users = await db
        .select(User)
        .from(User)
        .leftJoin(Post, eq(Post.userId, User.id))
      test.equal(users, [{id, name: 'Bob'}])
      const totals = await db
        .select({...User, total: count(Post.id)})
        .from(User)
        .leftJoin(Post, eq(Post.userId, User.id))
        .groupBy(User.id, User.name)
      test.equal(totals, [{id, name: 'Bob', total: 1}])
    } finally {
      await db.drop(User, Post)
    }
  })

  test('delete through an alias', async () => {
    try {
      await db.create(User)
      await db.insert(User).values([{name: 'Bob'}, {name: 'Mario'}])
      const Author = alias(User, 'Author')
      await db.delete(Author).where(eq(Author.name, 'Bob'))
      test.equal(await db.select(User.name).from(User), ['Mario'])
    } finally {
      await db.drop(User)
    }
  })
}
