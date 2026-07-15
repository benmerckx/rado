import type {DefineTest} from '@alinea/suite'
import {eq, include, table, type Database} from '#/index.ts'
import {id, integer, lastInsertId, text} from '#/universal.ts'

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
    const UserRole = table('UserRole', {
      id: id(),
      userId: integer().notNull(),
      role: text().notNull()
    })
    await db.create(User, Post, UserRole)
    await db.insert(User).values({name: 'Bob'})
    const user1 = await db.select(lastInsertId()).get()
    await db.insert(Post).values({userId: user1!, title: 'Post 1'})
    await db.insert(Post).values({userId: user1!, title: 'Post 2'})
    await db.insert(UserRole).values({userId: user1!, role: 'admin'})
    await db.insert(UserRole).values({userId: user1!, role: 'editor'})
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

    const selectUser = {
      ...User,
      roles: include(
        db
          .select(UserRole.role)
          .from(UserRole)
          .where(eq(UserRole.userId, User.id))
          .orderBy(UserRole.id)
      )
    }
    const usersWithRoles = db
      .select(selectUser)
      .from(User)
      .where(eq(User.id, user1))
    const userWithRoles = await usersWithRoles.get()
    test.equal(userWithRoles, {
      id: user1,
      name: 'Bob',
      roles: ['admin', 'editor']
    })

    const userWithFirstRoleQuery = db
      .select({
        firstRole: include.one(
          db
            .select(UserRole.role)
            .from(UserRole)
            .where(eq(UserRole.userId, User.id))
            .orderBy(UserRole.id)
            .limit(1)
        )
      })
      .from(User)
      .where(eq(User.id, user1))

    const userWithFirstRole = await userWithFirstRoleQuery.get()
    test.equal(userWithFirstRole, {firstRole: 'admin'})

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
    await db.drop(User, Post, UserRole)
  })
}
