import type {DefineTest} from '@alinea/suite'
import type {Database} from '#/core/Database.ts'
import {desc, eq, many, sql} from '#/index.ts'
import {insertRow, posts, User, users} from './Fixtures.ts'

export function testORMAliases(db: Database, test: DefineTest) {
  test('relation aliases cover filters, ordering, and raw sql', async () => {
    const ada = await insertRow(db, users, {name: 'Ada'}, eq(users.name, 'Ada'))
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
    const quote = db.dialect.runtime === 'mysql' ? '`' : '"'
    test.ok(emitted.includes(`as ${quote}user_posts${quote}`))
    test.ok(
      emitted.includes(`${quote}user_posts${quote}.${quote}title${quote}`)
    )
  })
}
