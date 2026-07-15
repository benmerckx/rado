import {suite} from '@alinea/suite'
import {desc, eq, many, sql} from '#/index.ts'
import {createDb, posts, User, users} from './Fixtures.ts'

suite(import.meta, test => {
  test('relation aliases cover filters, ordering, and raw sql', async () => {
    const db = await createDb()
    const ada = await db.insert(users).values({name: 'Ada'}).returning().get()
    await db.insert(posts).values([
      {authorId: ada!.id, title: 'A'},
      {authorId: ada!.id, title: 'B'}
    ])

    const result = await db.first(User, {
      where: eq(User.id, ada!.id),
      select: {
        posts: User.posts({
          select: {title: sql<string>`${posts.title}`},
          where: sql<boolean>`${posts.title} is not null`,
          orderBy: [desc(sql`${posts.title}`)]
        })
      }
    })
    test.equal(result, {posts: [{title: 'B'}, {title: 'A'}]})
  })

  test('explicit relation aliases remain available for readable sql', async () => {
    const db = await createDb()
    const UserWithAlias = {
      ...users,
      posts: many(posts, {
        from: users.id,
        to: posts.authorId,
        alias: 'user_posts'
      })
    }
    const query = db.find(UserWithAlias, {
      select: {posts: UserWithAlias.posts({select: {title: posts.title}})}
    })
    const emitted = query.toSQL().sql
    test.ok(emitted.includes('as "user_posts"'))
    test.ok(emitted.includes('"user_posts"."title"'))
  })
})
