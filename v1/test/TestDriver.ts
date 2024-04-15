import {expect} from 'bun:test'
import type {Database} from '../core/Database.ts'
import {table} from '../core/Table.ts'
import {eq} from '../index.ts'
import {boolean, integer, text} from '../sqlite.ts'

export function testDriver(
  createDb: () => Promise<Database>,
  test: (name: string, fn: () => void) => void
) {
  const Node = table('Node', {
    id: integer().primaryKey(),
    textField: text().notNull(),
    bool: boolean()
  })

  test('create table', async () => {
    const db = await createDb()
    await db.create(Node)
    await db.insert(Node).values({
      textField: 'hello',
      bool: true
    })
    const nodes = await db.select().from(Node)
    expect(nodes).toEqual([{id: 1, textField: 'hello', bool: true}])
    await db.update(Node).set({textField: 'world'}).where(eq(Node.id, 1))
    const [node] = await db.select(Node.textField).from(Node)
    expect(node).toEqual('world')
    await db.close()
  })

  const User = table('User', {
    id: integer().primaryKey(),
    name: text().notNull()
  })

  const Post = table('Post', {
    id: integer().primaryKey(),
    userId: integer().notNull(),
    title: text().notNull()
  })

  test('joins', async () => {
    const db = await createDb()
    await db.create(User)
    await db.create(Post)
    const [user1, user2] = await db
      .insert(User)
      .values([{name: 'Bob'}, {name: 'Mario'}])
      .returning(User.id)
    const [post1, post2] = await db
      .insert(Post)
      .values([
        {userId: user1, title: 'Post 1'},
        {userId: user1, title: 'Post 2'}
      ])
      .returning(Post.id)
    const posts = await db.select().from(Post)
    expect(posts).toEqual([
      {id: post1, userId: user1, title: 'Post 1'},
      {id: post2, userId: user1, title: 'Post 2'}
    ])
    const userAndPosts = await db
      .select()
      .from(User)
      .innerJoin(Post, eq(Post.userId, User.id))
      .where(eq(User.id, user1))
    expect(userAndPosts).toEqual([
      {
        User: {id: user1, name: 'Bob'},
        Post: {id: post1, userId: user1, title: 'Post 1'}
      },
      {
        User: {id: user1, name: 'Bob'},
        Post: {id: post2, userId: user1, title: 'Post 2'}
      }
    ])

    const noPosts = await db
      .select()
      .from(User)
      .leftJoin(Post, eq(Post.userId, 42))
      .where(eq(User.id, user1))
    expect(noPosts).toEqual([
      {
        User: {id: user1, name: 'Bob'},
        Post: null
      }
    ])

    const rightJoin = await db
      .select()
      .from(Post)
      .rightJoin(User, eq(User.id, Post.userId))
      .where(eq(User.id, user2))

    expect(rightJoin).toEqual([
      {
        Post: null,
        User: {id: 2, name: 'Mario'}
      }
    ])

    await db.close()
  })
}
