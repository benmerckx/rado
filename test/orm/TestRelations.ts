import type {DefineTest} from '@alinea/suite'
import type {Database} from '#/core/Database.ts'
import {and, eq} from '#/index.ts'
import {
  comments,
  Node,
  nodes,
  Order,
  OrderItem,
  orderTags,
  Post,
  posts,
  tags,
  User,
  UserGraph,
  users
} from './Fixtures.ts'

export function testORMRelations(db: Database, test: DefineTest) {
  test('relations are selected explicitly and remain fully shaped', async () => {
    const ada = await db.save(UserGraph, {
      name: 'Ada',
      posts: [{title: 'Hello', comments: [{body: 'Nice'}]}, {title: 'World'}]
    })
    const hello = ada.posts[0]

    const user = await db.first(User, {
      where: eq(User.id, ada.id),
      select: {
        ...User,
        posts: User.posts(() => ({
          select: {title: posts.title},
          orderBy: [posts.title]
        }))
      }
    })
    test.equal(user, {
      id: ada.id,
      name: 'Ada',
      email: null,
      loginCount: 0,
      posts: [{title: 'Hello'}, {title: 'World'}]
    })

    const post = await db.first(Post, {
      where: eq(Post.id, hello.id),
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
    const ada = await db.save(UserGraph, {
      name: 'Ada',
      posts: [{title: 'Hello'}]
    })

    const result = await db.first(User, {
      where: eq(User.id, ada.id),
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
    const ada = await db.save(UserGraph, {
      name: 'Ada',
      posts: [
        {title: 'With comment', comments: [{body: 'Visible'}]},
        {title: 'No comment'}
      ]
    })

    const result = await db.first(User, {
      where: eq(User.id, ada.id),
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
    const hello = await db.save(Post, {
      title: 'Hello',
      author: {name: 'Ada'},
      tags: [{name: 'ORM'}, {name: 'SQL'}]
    })
    await db.save(Post, {
      title: 'World',
      authorId: hello.author.id,
      tags: [{id: hello.tags[1].id}]
    })

    const result = await db.first(Post, {
      where: eq(Post.id, hello.id),
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

  test('definition filters scope relation loads and predicates', async () => {
    const ada = await db.save(UserGraph, {
      name: 'Ada',
      posts: [
        {title: 'Published', published: true},
        {title: 'Draft', published: false}
      ]
    })

    const result = await db.first(User, {
      where: eq(User.id, ada.id),
      select: {
        posts: User.publishedPosts({select: {title: posts.title}})
      }
    })
    test.equal(result, {posts: [{title: 'Published'}]})
    test.equal(
      await db.count(User, {
        where: User.publishedPosts.some({where: eq(posts.title, 'Draft')})
      }),
      0
    )
  })

  test('orders use their store and order number across relations', async () => {
    const order = await db.save(Order, {
      storeId: 'antwerp',
      orderNumber: '2026-001',
      customer: 'Ada',
      items: [{product: 'Keyboard'}],
      tags: [{name: 'Priority'}]
    })

    test.equal(order.items[0], {
      id: order.items[0].id,
      storeId: 'antwerp',
      orderNumber: '2026-001',
      product: 'Keyboard'
    })
    test.equal(await db.find(orderTags), [
      {
        storeId: 'antwerp',
        orderNumber: '2026-001',
        tagId: order.tags[0].id
      }
    ])

    const result = await db.first(Order, {
      where: and(
        eq(Order.storeId, 'antwerp'),
        eq(Order.orderNumber, '2026-001')
      ),
      select: {
        items: Order.items({
          select: {product: OrderItem.product}
        }),
        tags: Order.tags({select: {name: tags.name}})
      }
    })
    test.equal(result, {
      items: [{product: 'Keyboard'}],
      tags: [{name: 'Priority'}]
    })

    const item = await db.first(OrderItem, {
      where: eq(OrderItem.id, order.items[0].id),
      select: {order: OrderItem.order()}
    })
    test.equal(item, {
      order: {
        storeId: 'antwerp',
        orderNumber: '2026-001',
        customer: 'Ada'
      }
    })
  })

  test('self relation callbacks distinguish related and outer rows', async () => {
    const root = await db.save(nodes, {name: 'Root'})
    const middle = await db.save(nodes, {
      name: 'Middle',
      parentId: root.id
    })
    const child = await db.save(nodes, {
      name: 'Child',
      parentId: middle.id
    })

    const result = await db.first(Node, {
      where: eq(Node.id, child.id),
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
        parentId: middle.id,
        childId: child.id,
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
