import type {DefineTest} from '@alinea/suite'
import {type Database, alias, eq} from '#/index.ts'
import {Node, Parent, Post, PostTag, Tag, User} from './bundle/schema.ts'
import * as tables from './bundle/User.ts'

const all = [User, Post, Tag, PostTag, Node]

export function testBundle(db: Database, test: DefineTest) {
  test('related tables', async () => {
    await db.create(...all)
    try {
      await db.insert(User).values([{name: 'Ada'}, {name: 'Bob'}])
      await db.insert(User.posts.of({id: 1})).values({title: 'A'})
      await db.insert(Tag).values([{name: 'sql'}, {name: 'ts'}])
      await db.insert(Post.links.of({id: 1})).values([{tagId: 1}, {tagId: 2}])
      await db.update(User).set({name: 'Bobby'}).where(eq(User.id, 2))

      const users = await db
        .select(User, {posts: User.posts, total: User.posts.count()})
        .from(User)
        .orderBy(User.id)
      test.equal(users, [
        {
          id: 1,
          name: 'Ada',
          posts: [{id: 1, authorId: 1, title: 'A'}],
          total: 1
        },
        {id: 2, name: 'Bobby', posts: [], total: 0}
      ])
      test.equal(await db.select(User).from(User).orderBy(User.id), [
        {id: 1, name: 'Ada'},
        {id: 2, name: 'Bobby'}
      ])
      test.equal(
        await db
          .select({...User})
          .from(User)
          .where(eq(User.id, 2)),
        [{id: 2, name: 'Bobby', posts: []}]
      )
      const posts = User.posts.select(Post, {
        tags: Post.tags.select(Tag.name).orderBy(Tag.id)
      })
      test.equal(
        await db.select(posts).from(User).where(eq(User.id, 1)).get(),
        [{id: 1, authorId: 1, title: 'A', tags: ['sql', 'ts']}]
      )

      const post = await db
        .select({
          title: Post.title,
          author: Post.author.select(User.name),
          tags: Post.tags.select(Tag.name).orderBy(Tag.id)
        })
        .from(Post)
        .innerJoin(User, eq(User.id, Post.authorId))
        .get()
      test.equal(post, {title: 'A', author: 'Ada', tags: ['sql', 'ts']})

      const Author = alias(User, 'Author')
      const authors = await db
        .select({
          name: Author.name,
          total: User.posts.alias(Post, Author).count()
        })
        .from(Author)
        .orderBy(Author.id)
      test.equal(authors, [
        {name: 'Ada', total: 1},
        {name: 'Bobby', total: 0}
      ])

      await db.delete(User).where(eq(User.id, 2))
      test.equal(await db.select().from(User), [{id: 1, name: 'Ada'}])
    } finally {
      await db.drop(...all.toReversed())
    }
  })

  test('related self relation', async () => {
    await db.create(Node)
    try {
      await db
        .insert(Node)
        .values([
          {name: 'root'},
          {name: 'leaf', parentId: 1},
          {name: 'twig', parentId: 2}
        ])
      const nodes = await db
        .select({
          name: Node.name,
          parent: Node.parent.select({
            name: Parent.name,
            parent: Parent.parent.select(Node.name)
          })
        })
        .from(Node)
        .orderBy(Node.id)
      test.equal(nodes, [
        {name: 'root', parent: null},
        {name: 'leaf', parent: {name: 'root', parent: null}},
        {name: 'twig', parent: {name: 'leaf', parent: 'root'}}
      ])
    } finally {
      await db.drop(Node)
    }
  })

  if (!db.driver.supportsTransactions) return
  test('related migration', async () => {
    try {
      await db.migrate(User)
      const plain = await db.transaction(db.diff(tables.User))
      test.equal(await db.transaction(db.diff(User)), plain)
    } finally {
      await db.drop(User)
    }
  })
}
