import {suite} from '@alinea/suite'
import type {Database} from '#/core/Database.ts'
import type {Sync} from '#/core/MetaData.ts'
import {table} from '#/core/Table.ts'
import {one} from '#/index.ts'
import {id, integer, text} from '#/universal.ts'
import {Post, posts, User, UserGraph} from './Fixtures.ts'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false
const Expect = <T extends true>() => {}
const typecheck = (_run: () => void) => {}

suite(import.meta, test => {
  test('ORM query and relation result types', () => {
    typecheck(() => {
      const db: Database<Sync<'sqlite'>> = undefined!

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

      const nestedGraph = db.save(UserGraph, {
        name: 'Ada',
        posts: [{title: 'Hello', comments: [{body: 'Nice'}]}]
      })
      Expect<
        Equal<
          Awaited<typeof nestedGraph>,
          {
            id: number
            name: string
            email: string | null
            loginCount: number
            posts: Array<{
              id: number
              authorId: number
              title: string
              published: boolean
              comments: Array<{
                id: number
                postId: number
                body: string
              }>
            }>
          }
        >
      >()

      const savedPost = db.save(Post, {
        title: 'Hello',
        author: {name: 'Ada'},
        comments: [{body: 'Nice'}]
      })
      Expect<
        Equal<
          Awaited<typeof savedPost>,
          {
            id: number
            authorId: number
            title: string
            published: boolean
            author: {
              id: number
              name: string
              email: string | null
              loginCount: number
            }
            comments: Array<{
              id: number
              postId: number
              body: string
            }>
          }
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
          posts: User.posts({select: {title: posts.title}})
        }
      })
      Expect<
        Equal<
          Awaited<typeof withPosts>,
          Array<{name: string; posts: Array<{title: string}>}>
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
            } | null
          }>
        >
      >()

      const saved = db.save(User, {name: 'Ada'})
      Expect<
        Equal<
          Awaited<typeof saved>,
          {
            id: number
            name: string
            email: string | null
            loginCount: number
          }
        >
      >()

      const savedMany = db.save(User, [{name: 'Ada'}, {name: 'Grace'}])
      Expect<
        Equal<
          Awaited<typeof savedMany>,
          Array<{
            id: number
            name: string
            email: string | null
            loginCount: number
          }>
        >
      >()

      const savedGraph = db.save(User, {
        name: 'Ada',
        posts: [{title: 'Hello'}]
      })
      Expect<
        Equal<
          Awaited<typeof savedGraph>,
          {
            id: number
            name: string
            email: string | null
            loginCount: number
            posts: Array<{
              id: number
              authorId: number
              title: string
              published: boolean
            }>
          }
        >
      >()
    })
  })

  test('self relation callback result types', () => {
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
          parent: Node.parent(outer => ({
            select: {
              parentId: nodes.id,
              childId: outer.id
            }
          }))
        }
      })
      Expect<
        Equal<
          Awaited<typeof result>,
          Array<{
            parent: {parentId: number; childId: number} | null
          }>
        >
      >()
    })
  })
})
