import type {DefineTest} from '@alinea/suite'
import type {Database} from '#/core/Database.ts'
import {columns, eq} from '#/index.ts'
import {
  comments,
  insertRow,
  Node,
  nodes,
  Post,
  posts,
  postTags,
  tags,
  User,
  users
} from './Fixtures.ts'

export function testORMRelations(db: Database, test: DefineTest) {
  test('relations are selected explicitly and remain fully shaped', async () => {
    const ada = await insertRow(db, users, {name: 'Ada'}, eq(users.name, 'Ada'))
    const hello = await insertRow(
      db,
      posts,
      {authorId: ada.id, title: 'Hello'},
      eq(posts.title, 'Hello')
    )
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
    const ada = await insertRow(db, users, {name: 'Ada'}, eq(users.name, 'Ada'))
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

  test('relation joins use the aliased relation target', async () => {
    const ada = await insertRow(db, users, {name: 'Ada'}, eq(users.name, 'Ada'))
    const withComment = await insertRow(
      db,
      posts,
      {authorId: ada.id, title: 'With comment'},
      eq(posts.title, 'With comment')
    )
    await db.insert(posts).values({authorId: ada!.id, title: 'No comment'})
    await db.insert(comments).values({postId: withComment!.id, body: 'Visible'})

    const result = await db.first(User, {
      where: eq(User.id, ada!.id),
      select: {
        posts: User.posts({
          joins: [
            {
              innerJoin: comments,
              on: eq(comments.postId, posts.id)
            }
          ],
          select: {title: posts.title, body: comments.body}
        })
      }
    })
    test.equal(result, {
      posts: [{title: 'With comment', body: 'Visible'}]
    })
  })

  test('many relations resolve through a join table', async () => {
    const ada = await insertRow(db, users, {name: 'Ada'}, eq(users.name, 'Ada'))
    const hello = await insertRow(
      db,
      posts,
      {authorId: ada.id, title: 'Hello'},
      eq(posts.title, 'Hello')
    )
    const world = await insertRow(
      db,
      posts,
      {authorId: ada.id, title: 'World'},
      eq(posts.title, 'World')
    )
    const orm = await insertRow(db, tags, {name: 'ORM'}, eq(tags.name, 'ORM'))
    const sql = await insertRow(db, tags, {name: 'SQL'}, eq(tags.name, 'SQL'))
    await db.insert(postTags).values([
      {postId: hello!.id, tagId: orm!.id},
      {postId: hello!.id, tagId: sql!.id},
      {postId: world!.id, tagId: sql!.id}
    ])

    const result = await db.first(Post, {
      where: eq(Post.id, hello!.id),
      select: {
        title: Post.title,
        tags: Post.tags({select: {name: tags.name}, orderBy: [tags.name]})
      }
    })
    test.equal(result, {
      title: 'Hello',
      tags: [{name: 'ORM'}, {name: 'SQL'}]
    })
  })

  test('self relation callbacks distinguish related and outer rows', async () => {
    const root = await insertRow(
      db,
      nodes,
      {name: 'Root'},
      eq(nodes.name, 'Root')
    )
    const middle = await insertRow(
      db,
      nodes,
      {name: 'Middle', parentId: root.id},
      eq(nodes.name, 'Middle')
    )
    const child = await insertRow(
      db,
      nodes,
      {name: 'Child', parentId: middle.id},
      eq(nodes.name, 'Child')
    )

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
}
