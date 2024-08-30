import {eq, type Database} from '@/index.ts'
import {lastInsertId} from '@/universal.ts'
import type {DefineTest} from '@alinea/suite'
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
}
