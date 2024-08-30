import {eq, include, table, type Database} from '@/index.ts'
import {id, integer, lastInsertId, text} from '@/universal.ts'
import type {DefineTest} from '@alinea/suite'

export function testInclude(db: Database, test: DefineTest) {
  test('include', async () => {
    const User = table('User', {
      id: id(),
      name: text().notNull()
    })
    const Post = table('Post', {
      id: id(),
      userId: integer().notNull(),
      title: text().notNull()
    })
    await db.create(User, Post)
    await db.insert(User).values({name: 'Bob'})
    const user1 = await db.select(lastInsertId()).get()
    await db.insert(Post).values({userId: user1!, title: 'Post 1'})
    await db.insert(Post).values({userId: user1!, title: 'Post 2'})
    const posts = include(
      db.select().from(Post).where(eq(Post.userId, User.id))
    )
    const result = await db
      .select({...User, posts})
      .from(User)
      .where(eq(User.id, user1))
      .get()
    test.equal(result, {
      id: user1,
      name: 'Bob',
      posts: [
        {id: 1, userId: user1, title: 'Post 1'},
        {id: 2, userId: user1, title: 'Post 2'}
      ]
    })
    const emptyOne = await db
      .select({
        empty: include.one(db.select().from(User).where(eq(User.id, 42)))
      })
      .get()
    test.equal(emptyOne, {empty: null})
    const postsWithUser = await db
      .select({
        ...Post,
        user: include.one(
          db.select().from(User).where(eq(User.id, Post.userId))
        )
      })
      .from(Post)
    test.equal(postsWithUser, [
      {
        id: 1,
        userId: user1,
        title: 'Post 1',
        user: {id: user1, name: 'Bob'}
      },
      {
        id: 2,
        userId: user1,
        title: 'Post 2',
        user: {id: user1, name: 'Bob'}
      }
    ])

    const emptyResult = await db.select({
      empty: include(db.select().from(User).where(eq(User.id, 42)))
    })
    test.equal(emptyResult, [{empty: []}])

    const nestedResult = await db
      .select({
        user: include.one(
          db
            .select({
              ...User,
              posts: include(
                db.select().from(Post).where(eq(Post.userId, User.id))
              )
            })
            .from(User)
        )
      })
      .get()
    test.equal(nestedResult, {
      user: {
        id: user1,
        name: 'Bob',
        posts: [
          {id: 1, userId: user1, title: 'Post 1'},
          {id: 2, userId: user1, title: 'Post 2'}
        ]
      }
    })
    await db.drop(User, Post)
  })
}
