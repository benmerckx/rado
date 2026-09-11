import {suite} from '@alinea/suite'
import type {Database} from '#/core/Database.ts'
import type {Sync} from '#/core/MetaData.ts'
import {table} from '#/core/Table.ts'
import {eq, is, one, some, type Sql} from '#/index.ts'
import {id, integer, text} from '#/universal.ts'
import {Post, User, UserGraph} from './Fixtures.ts'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false
const Expect = <T extends true>() => {}
const typecheck = (_run: () => void) => {}

suite(import.meta, test => {
  test('ORM query, relation, and write result types', () => {
    typecheck(() => {
      const db: Database<Sync<'sqlite'>> = undefined!
      const mysqlDb: Database<Sync<'mysql'>> = undefined!

      const found = db.find(User)
      Expect<
        Equal<
          Awaited<typeof found>,
          Array<{
            id: number
            name: string
            email: string | null
            loginCount: number
          }>
        >
      >()

      const first = db.first(User)
      Expect<
        Equal<
          Awaited<typeof first>,
          {
            id: number
            name: string
            email: string | null
            loginCount: number
          } | null
        >
      >()

      const withPosts = db.find(User, {
        select: {
          name: User.name,
          posts: User.posts({select: {title: User.posts.title}})
        }
      })
      Expect<
        Equal<
          Awaited<typeof withPosts>,
          Array<{name: string; posts: Array<{title: string}>}>
        >
      >()

      const nested = db.find(UserGraph, {
        select: {
          posts: UserGraph.posts({
            select: {
              title: UserGraph.posts.title,
              author: UserGraph.posts.author({
                select: {name: UserGraph.posts.author.name}
              })
            }
          })
        }
      })
      Expect<
        Equal<
          Awaited<typeof nested>,
          Array<{
            posts: Array<{title: string; author: {name: string}}>
          }>
        >
      >()

      const withAuthor = db.find(Post, {
        select: {author: Post.author()}
      })
      Expect<
        Equal<
          Awaited<typeof withAuthor>,
          Array<{
            author: {
              id: number
              name: string
              email: string | null
              loginCount: number
            }
          }>
        >
      >()

      const predicate = some(User.posts, eq(User.posts.published, true))
      Expect<Equal<typeof predicate, Sql<boolean>>>()
      db.find(User, {where: predicate})

      const inserted = db
        .write(User)
        .insert({name: 'Ada'})
        .insert(User.posts, {title: 'Hello'})
      Expect<Equal<Awaited<typeof inserted>, void>>()

      const returned = inserted.returning({
        id: User.id,
        name: User.name
      })
      Expect<
        Equal<Awaited<typeof returned>, Array<{id: number; name: string}>>
      >()

      // @ts-expect-error returning is not available for mysql
      mysqlDb.write(User).insert({name: 'Ada'}).returning()
      // @ts-expect-error graph selection needs captured database values
      mysqlDb.write(User).insert({name: 'Ada'}).select({id: User.id})

      const graph = inserted.select({
        name: User.name,
        posts: User.posts({select: {title: User.posts.title}})
      })
      Expect<
        Equal<
          Awaited<typeof graph>,
          Array<{name: string; posts: Array<{title: string}>}>
        >
      >()

      const dependencies = db
        .write(Post)
        .where(eq(Post.id, 1))
        .update({title: 'Updated'})
        .connect(Post.author, eq(Post.author.name, 'Ada'))
      dependencies.returning({id: Post.id})
      const children = dependencies.insert(Post.comments, {body: 'Hello'})
      // @ts-expect-error root changes must precede dependent writes
      children.connect(Post.author, eq(Post.author.name, 'Grace'))
      // @ts-expect-error inserting a root dependency after children is ambiguous
      children.insert(Post.author, {name: 'Grace'})
      // @ts-expect-error root updates must precede dependent writes
      db.write(User)
        .where(eq(User.id, 1))
        .insert(User.posts, {title: 'Hello'})
        .update({name: 'Grace'})

      const relationOnly = db
        .write(User)
        .where(eq(User.id, 1))
        .insert(User.posts, {title: 'Hello'})
      // @ts-expect-error returning requires a root mutation
      relationOnly.returning()
      relationOnly.select({posts: User.posts()})

      const scoped = db
        .write(Post)
        .where(eq(Post.id, 1))
        .update({title: 'Updated'})
        .insert(Post.comments, {body: 'New'})
        .update(Post.comments, eq(Post.comments.id, 2), {body: 'Edited'})
        .delete(Post.comments, eq(Post.comments.id, 3))
        .connect(Post.tags, eq(Post.tags.name, 'ORM'))
        .disconnect(Post.tags, eq(Post.tags.id, 4))
        .write(User)
        .insert({name: 'Grace'})
      Expect<Equal<Awaited<typeof scoped>, void>>()

      // @ts-expect-error relation operations require an anchored root
      db.write(User).insert(User.posts, {title: 'Hello'})
      db.write(User)
        .where(eq(User.id, 1))
        // @ts-expect-error related updates use the related model's fields
        .update(User.posts, eq(User.posts.id, 1), {name: 'Invalid'})
    })
  })

  test('self relation field result types', () => {
    typecheck(() => {
      const db: Database<Sync<'sqlite'>> = undefined!
      const nodes = table('node', {
        id: id(),
        parentId: integer(),
        name: text().notNull()
      })
      const Node = {
        ...nodes,
        parent: one(nodes, {from: nodes.parentId, to: nodes.id})
      }

      const result = db.find(Node, {
        select: {
          childId: Node.id,
          parent: Node.parent({
            select: {
              id: Node.parent.id
            }
          })
        }
      })
      Expect<
        Equal<
          Awaited<typeof result>,
          Array<{
            childId: number
            parent: {id: number} | null
          }>
        >
      >()

      db.find(Node, {
        where: is(Node.parent, eq(Node.parent.name, Node.name))
      })
    })
  })
})
