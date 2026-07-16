import type {DefineTest} from '@alinea/suite'
import type {Database} from '#/core/Database.ts'
import {and, eq} from '#/index.ts'
import {Node, nodes, Post, posts, tags, User, UserGraph} from './Fixtures.ts'

export function testORMPredicates(db: Database, test: DefineTest) {
  test('many relation predicates support some, none, and every', async () => {
    await db.save(UserGraph, [
      {
        name: 'Ada',
        posts: [
          {title: 'Published', published: true},
          {title: 'Draft', published: false}
        ]
      },
      {
        name: 'Grace',
        posts: [{title: 'Only published', published: true}]
      },
      {name: 'Lin', posts: []}
    ])

    const some = await db.find(User, {
      where: User.posts.some({where: eq(posts.published, true)}),
      select: {name: User.name},
      orderBy: [User.name]
    })
    test.equal(some, [{name: 'Ada'}, {name: 'Grace'}])

    const none = await db.find(User, {
      where: User.posts.none({where: eq(posts.published, true)}),
      select: {name: User.name},
      orderBy: [User.name]
    })
    test.equal(none, [{name: 'Lin'}])

    const every = await db.find(User, {
      where: User.posts.every({where: eq(posts.published, true)}),
      select: {name: User.name},
      orderBy: [User.name]
    })
    test.equal(every, [{name: 'Grace'}, {name: 'Lin'}])
  })

  test('one relation predicates support is and isNot', async () => {
    await db.save(UserGraph, [
      {name: 'Ada', posts: [{title: 'Ada post'}]},
      {name: 'Grace', posts: [{title: 'Grace post'}]}
    ])

    const isAda = await db.find(Post, {
      where: Post.author.is({where: eq(User.name, 'Ada')}),
      select: {title: Post.title}
    })
    test.equal(isAda, [{title: 'Ada post'}])

    const isNotAda = await db.find(Post, {
      where: Post.author.isNot({where: eq(User.name, 'Ada')}),
      select: {title: Post.title}
    })
    test.equal(isNotAda, [{title: 'Grace post'}])
  })

  test('many relation predicates resolve through tables', async () => {
    await db.save(UserGraph, {
      name: 'Ada',
      posts: [
        {title: 'ORM post', tags: [{name: 'ORM'}, {name: 'SQL'}]},
        {title: 'SQL post', tags: [{name: 'SQL'}]}
      ]
    })

    const orm = await db.find(Post, {
      where: Post.tags.some({where: eq(tags.name, 'ORM')}),
      select: {title: Post.title}
    })
    test.equal(orm, [{title: 'ORM post'}])

    const withoutORM = await db.find(Post, {
      where: Post.tags.none({where: eq(tags.name, 'ORM')}),
      select: {title: Post.title}
    })
    test.equal(withoutORM, [{title: 'SQL post'}])
  })

  test('self relation predicate callbacks distinguish outer rows', async () => {
    const root = await db.save(nodes, {name: 'Root'})
    await db.save(nodes, [
      {name: 'Middle', parentId: root.id},
      {name: 'Other', parentId: root.id}
    ])

    const result = await db.find(Node, {
      where: Node.parent.is(child => ({
        where: and(eq(nodes.name, 'Root'), eq(child.name, 'Middle'))
      })),
      select: {name: Node.name}
    })
    test.equal(result, [{name: 'Middle'}])
  })
}
