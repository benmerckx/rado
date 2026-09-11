import type {DefineTest} from '@alinea/suite'
import type {Database} from '#/core/Database.ts'
import {and, eq, some} from '#/index.ts'
import {
  comments,
  Node,
  nodes,
  Order,
  OrderItem,
  orderTags,
  Post,
  User,
  UserGraph
} from './Fixtures.ts'

export function testORMRelations(db: Database, test: DefineTest) {
  test('relations are selected explicitly and remain fully shaped', async () => {
    await db
      .write(User)
      .insert({name: 'Ada'})
      .insert(User.posts, [{title: 'Hello'}, {title: 'World'}])
    await db
      .write(Post)
      .where(eq(Post.title, 'Hello'))
      .insert(Post.comments, {body: 'Nice'})

    const user = await db.first(User, {
      where: eq(User.name, 'Ada'),
      select: {
        name: User.name,
        posts: User.posts({
          select: {title: User.posts.title},
          orderBy: [User.posts.title]
        })
      }
    })
    test.equal(user, {
      name: 'Ada',
      posts: [{title: 'Hello'}, {title: 'World'}]
    })

    const post = await db.first(Post, {
      where: eq(Post.title, 'Hello'),
      select: {
        title: Post.title,
        author: Post.author({select: {name: Post.author.name}}),
        comments: Post.comments({select: {body: Post.comments.body}})
      }
    })
    test.equal(post, {
      title: 'Hello',
      author: {name: 'Ada'},
      comments: [{body: 'Nice'}]
    })
  })

  test('nested relations resolve their source through the outer alias', async () => {
    await db
      .write(User)
      .insert({name: 'Ada'})
      .insert(User.posts, {title: 'Hello'})

    const result = await db.first(UserGraph, {
      where: eq(UserGraph.name, 'Ada'),
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
    test.equal(result, {
      posts: [{title: 'Hello', author: {name: 'Ada'}}]
    })
  })

  test('relation joins use the aliased relation target', async () => {
    await db
      .write(User)
      .insert({name: 'Ada'})
      .insert(User.posts, [{title: 'With comment'}, {title: 'No comment'}])
    await db
      .write(Post)
      .where(eq(Post.title, 'With comment'))
      .insert(Post.comments, {body: 'Visible'})

    const result = await db.first(User, {
      where: eq(User.name, 'Ada'),
      select: {
        posts: User.posts({
          joins: [
            {
              innerJoin: comments,
              on: eq(comments.postId, User.posts.id)
            }
          ],
          select: {title: User.posts.title, body: comments.body}
        })
      }
    })
    test.equal(result, {
      posts: [{title: 'With comment', body: 'Visible'}]
    })
  })

  test('many relations resolve through a join table', async () => {
    await db
      .write(User)
      .insert({name: 'Ada'})
      .insert(User.posts, {title: 'Hello'})
      .write(Post)
      .where(eq(Post.title, 'Hello'))
      .insert(Post.tags, [{name: 'ORM'}, {name: 'SQL'}])
      .write(User)
      .where(eq(User.name, 'Ada'))
      .insert(User.posts, {title: 'World'})
      .write(Post)
      .where(eq(Post.title, 'World'))
      .connect(Post.tags, eq(Post.tags.name, 'SQL'))

    const result = await db.first(Post, {
      where: eq(Post.title, 'Hello'),
      select: {
        title: Post.title,
        tags: Post.tags({
          select: {name: Post.tags.name},
          orderBy: [Post.tags.name]
        })
      }
    })
    test.equal(result, {
      title: 'Hello',
      tags: [{name: 'ORM'}, {name: 'SQL'}]
    })
    test.equal(
      await db.first(Post, {
        where: eq(Post.title, 'World'),
        select: {tags: Post.tags({select: {name: Post.tags.name}})}
      }),
      {tags: [{name: 'SQL'}]}
    )
  })

  test('relation fields cannot shadow relation loading internals', async () => {
    await db
      .write(User)
      .insert({name: 'Ada'})
      .insert(User.posts, {title: 'Hello'})
      .write(Post)
      .where(eq(Post.title, 'Hello'))
      .insert(Post.tags, {name: 'ORM', include: 'loaded'})

    test.equal(
      await db.first(Post, {
        where: eq(Post.title, 'Hello'),
        select: {
          tags: Post.tags({select: {include: Post.tags.include}})
        }
      }),
      {tags: [{include: 'loaded'}]}
    )
  })

  test('definition filters scope relation loads and predicates', async () => {
    await db
      .write(User)
      .insert({name: 'Ada'})
      .insert(User.posts, [
        {title: 'Published', published: true},
        {title: 'Draft', published: false}
      ])

    const result = await db.first(User, {
      where: eq(User.name, 'Ada'),
      select: {
        posts: User.publishedPosts({
          select: {title: User.publishedPosts.title}
        })
      }
    })
    test.equal(result, {posts: [{title: 'Published'}]})
    test.equal(
      await db.count(User, {
        where: some(User.publishedPosts, eq(User.publishedPosts.title, 'Draft'))
      }),
      0
    )
  })

  test('orders use their store and order number across relations', async () => {
    await db
      .write(Order)
      .insert({
        storeId: 'antwerp',
        orderNumber: '2026-001',
        customer: 'Ada'
      })
      .insert(Order.items, {product: 'Keyboard'})
      .insert(Order.tags, {name: 'Priority'})
    const order = await db.first(Order, {
      where: and(
        eq(Order.storeId, 'antwerp'),
        eq(Order.orderNumber, '2026-001')
      ),
      select: {
        ...Order,
        items: Order.items(),
        tags: Order.tags()
      }
    })

    test.equal(order!.items[0], {
      id: order!.items[0]!.id,
      storeId: 'antwerp',
      orderNumber: '2026-001',
      product: 'Keyboard'
    })
    test.equal(await db.find(orderTags), [
      {
        storeId: 'antwerp',
        orderNumber: '2026-001',
        tagId: order!.tags[0]!.id
      }
    ])

    const result = await db.first(Order, {
      where: and(
        eq(Order.storeId, 'antwerp'),
        eq(Order.orderNumber, '2026-001')
      ),
      select: {
        items: Order.items({
          select: {product: Order.items.product}
        }),
        tags: Order.tags({select: {name: Order.tags.name}})
      }
    })
    test.equal(result, {
      items: [{product: 'Keyboard'}],
      tags: [{name: 'Priority'}]
    })

    const item = await db.first(OrderItem, {
      where: eq(OrderItem.id, order!.items[0]!.id),
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

  test('self relation fields distinguish related and outer rows', async () => {
    await db.write(nodes).insert({name: 'Root'})
    const root = await db.first(nodes, {where: eq(nodes.name, 'Root')})
    await db.write(nodes).insert({name: 'Middle', parentId: root!.id})
    const middle = await db.first(nodes, {where: eq(nodes.name, 'Middle')})
    await db.write(nodes).insert({name: 'Child', parentId: middle!.id})
    const child = await db.first(nodes, {where: eq(nodes.name, 'Child')})

    const result = await db.first(Node, {
      where: eq(Node.id, child!.id),
      select: {
        childId: Node.id,
        childName: Node.name,
        parent: Node.parent({
          select: {
            id: Node.parent.id,
            name: Node.parent.name
          }
        })
      }
    })
    test.equal(result, {
      childId: child!.id,
      childName: 'Child',
      parent: {id: middle!.id, name: 'Middle'}
    })
  })
}
