import type {DefineTest} from '@alinea/suite'
import type {Database} from '#/core/Database.ts'
import {and, eq, every, is, isNot, none, some} from '#/index.ts'
import {Node, nodes, Post, User} from './Fixtures.ts'

export function testORMPredicates(db: Database, test: DefineTest) {
  test('many relation predicates support some, none, and every', async () => {
    for (const input of [
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
      await db
        .write(User)
        .insert({name: input.name})
        .insert(User.posts, input.posts)

    const someUsers = await db.find(User, {
      where: some(User.posts, eq(User.posts.published, true)),
      select: {name: User.name},
      orderBy: [User.name]
    })
    test.equal(someUsers, [{name: 'Ada'}, {name: 'Grace'}])

    const noUsers = await db.find(User, {
      where: none(User.posts, eq(User.posts.published, true)),
      select: {name: User.name},
      orderBy: [User.name]
    })
    test.equal(noUsers, [{name: 'Lin'}])

    const everyUser = await db.find(User, {
      where: every(User.posts, eq(User.posts.published, true)),
      select: {name: User.name},
      orderBy: [User.name]
    })
    test.equal(everyUser, [{name: 'Grace'}, {name: 'Lin'}])
  })

  test('one relation predicates support is and isNot', async () => {
    for (const input of [
      {name: 'Ada', posts: [{title: 'Ada post'}]},
      {name: 'Grace', posts: [{title: 'Grace post'}]}
    ])
      await db
        .write(User)
        .insert({name: input.name})
        .insert(User.posts, input.posts)

    const isAda = await db.find(Post, {
      where: is(Post.author, eq(Post.author.name, 'Ada')),
      select: {title: Post.title}
    })
    test.equal(isAda, [{title: 'Ada post'}])

    const isNotAda = await db.find(Post, {
      where: isNot(Post.author, eq(Post.author.name, 'Ada')),
      select: {title: Post.title}
    })
    test.equal(isNotAda, [{title: 'Grace post'}])
  })

  test('many relation predicates resolve through tables', async () => {
    await db
      .write(User)
      .insert({name: 'Ada'})
      .insert(User.posts, [{title: 'ORM post'}, {title: 'SQL post'}])
    await db
      .write(Post)
      .where(eq(Post.title, 'ORM post'))
      .insert(Post.tags, [{name: 'ORM'}, {name: 'SQL'}])
      .write(Post)
      .where(eq(Post.title, 'SQL post'))
      .insert(Post.tags, {name: 'SQL'})

    const orm = await db.find(Post, {
      where: some(Post.tags, eq(Post.tags.name, 'ORM')),
      select: {title: Post.title}
    })
    test.equal(orm, [{title: 'ORM post'}])

    const withoutORM = await db.find(Post, {
      where: none(Post.tags, eq(Post.tags.name, 'ORM')),
      select: {title: Post.title}
    })
    test.equal(withoutORM, [{title: 'SQL post'}])
  })

  test('self relation predicates distinguish related and outer rows', async () => {
    await db.write(nodes).insert({name: 'Root'})
    const root = await db.first(nodes, {where: eq(nodes.name, 'Root')})
    await db.write(nodes).insert([
      {name: 'Middle', parentId: root!.id},
      {name: 'Other', parentId: root!.id}
    ])

    const result = await db.find(Node, {
      where: is(
        Node.parent,
        and(eq(Node.parent.name, 'Root'), eq(Node.name, 'Middle'))
      ),
      select: {name: Node.name}
    })
    test.equal(result, [{name: 'Middle'}])
  })
}
