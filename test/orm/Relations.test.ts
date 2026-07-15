import {suite} from '@alinea/suite'
import {table} from '#/core/Table.ts'
import {columns, eq, one} from '#/index.ts'
import {id, integer, text} from '#/universal.ts'
import {comments, createDb, Post, posts, User, users} from './Fixtures.ts'

suite(import.meta, test => {
  test('relations are selected explicitly and remain fully shaped', async () => {
    const db = await createDb()
    const ada = await db.insert(users).values({name: 'Ada'}).returning().get()
    const hello = await db
      .insert(posts)
      .values({authorId: ada!.id, title: 'Hello'})
      .returning()
      .get()
    await db.insert(posts).values({authorId: ada!.id, title: 'World'})
    await db.insert(comments).values({postId: hello!.id, body: 'Nice'})

    const user = await db.first(User, {
      where: eq(User.id, ada!.id),
      select: {
        ...columns(User),
        posts: User.posts({
          select: {title: posts.title},
          orderBy: [posts.title]
        })
      }
    })
    test.equal(user, {
      id: ada!.id,
      name: 'Ada',
      email: null,
      loginCount: 0,
      posts: [{title: 'Hello'}, {title: 'World'}]
    })

    const post = await db.first(Post, {
      where: eq(Post.id, hello!.id),
      select: {
        title: Post.title,
        author: Post.author({select: {name: users.name}}),
        comments: Post.comments({select: {body: comments.body}})
      }
    })
    test.equal(post, {
      title: 'Hello',
      author: {name: 'Ada'},
      comments: [{body: 'Nice'}]
    })
  })

  test('nested relations resolve their source through the outer alias', async () => {
    const db = await createDb()
    const ada = await db.insert(users).values({name: 'Ada'}).returning().get()
    await db.insert(posts).values({authorId: ada!.id, title: 'Hello'})

    const result = await db.first(User, {
      where: eq(User.id, ada!.id),
      select: {
        posts: User.posts({
          select: {
            title: posts.title,
            author: Post.author({select: {name: users.name}})
          }
        })
      }
    })
    test.equal(result, {
      posts: [{title: 'Hello', author: {name: 'Ada'}}]
    })
  })

  test('self relation callbacks distinguish related and outer rows', async () => {
    const nodes = table('node', {
      id: id(),
      parentId: integer().references((): any => nodes.id),
      name: text().notNull()
    })
    const Node = {
      ...nodes,
      parent: one(nodes, {from: nodes.parentId, to: nodes.id})
    }
    const db = await createDb()
    await db.create(nodes)
    const root = await db.insert(nodes).values({name: 'Root'}).returning().get()
    const middle = await db
      .insert(nodes)
      .values({name: 'Middle', parentId: root!.id})
      .returning()
      .get()
    const child = await db
      .insert(nodes)
      .values({name: 'Child', parentId: middle!.id})
      .returning()
      .get()

    const result = await db.first(Node, {
      where: eq(Node.id, child!.id),
      select: {
        relation: Node.parent(parent => ({
          select: {
            parentId: nodes.id,
            childId: parent.id,
            parentName: nodes.name,
            childName: parent.name,
            grandparent: Node.parent(middleRow => ({
              select: {
                grandparentName: nodes.name,
                parentName: middleRow.name
              }
            }))
          }
        }))
      }
    })
    test.equal(result, {
      relation: {
        parentId: middle!.id,
        childId: child!.id,
        parentName: 'Middle',
        childName: 'Child',
        grandparent: {
          grandparentName: 'Root',
          parentName: 'Middle'
        }
      }
    })
  })
})
