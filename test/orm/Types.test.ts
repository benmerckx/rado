import {suite} from '@alinea/suite'
import type {Database} from '#/core/Database.ts'
import type {Sync} from '#/core/MetaData.ts'
import {table} from '#/core/Table.ts'
import {one} from '#/index.ts'
import {id, integer, text} from '#/universal.ts'
import {posts, User} from './Fixtures.ts'

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
