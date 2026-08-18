import type {DefineTest} from '@alinea/suite'
import type {Database} from '#/core/Database.ts'
import type {IsPostgres, IsSqlite} from '#/core/MetaData.ts'
import {eq} from '#/index.ts'
import {
  comments,
  Node,
  nodes,
  Order,
  orderItems,
  orders,
  Post,
  tags,
  User,
  users
} from './Fixtures.ts'

export function testORMWrite(db: Database, test: DefineTest) {
  test('write inserts roots and direct relations', async () => {
    await db
      .write(User)
      .insert({name: 'Ada'})
      .insert(User.posts, [{title: 'Hello'}, {title: 'World'}])

    test.equal(
      await db.first(User, {
        where: eq(User.name, 'Ada'),
        select: {
          name: User.name,
          posts: User.posts({
            select: {title: User.posts.title},
            orderBy: [User.posts.title]
          })
        }
      }),
      {
        name: 'Ada',
        posts: [{title: 'Hello'}, {title: 'World'}]
      }
    )
  })

  test('write scopes root and related updates and deletes', async () => {
    await db
      .write(User)
      .insert({name: 'Ada'})
      .insert(User.posts, [{title: 'Old'}, {title: 'Delete'}])

    await db
      .write(User)
      .where(eq(User.name, 'Ada'))
      .update({email: 'ada@example.com'})
      .insert(User.posts, {title: 'New'})
      .update(User.posts, eq(User.posts.title, 'Old'), {
        title: 'Updated'
      })
      .delete(User.posts, eq(User.posts.title, 'Delete'))

    test.equal(
      await db.first(User, {
        where: eq(User.name, 'Ada'),
        select: {
          email: User.email,
          posts: User.posts({
            select: {title: User.posts.title},
            orderBy: [User.posts.title]
          })
        }
      }),
      {
        email: 'ada@example.com',
        posts: [{title: 'New'}, {title: 'Updated'}]
      }
    )
  })

  test('write inserts, connects, and disconnects through relations', async () => {
    await db
      .write(User)
      .insert({name: 'Ada'})
      .insert(User.posts, {title: 'Post'})
      .write(tags)
      .insert({name: 'ORM'})
      .write(Post)
      .where(eq(Post.title, 'Post'))
      .connect(Post.tags, eq(Post.tags.name, 'ORM'))
      .insert(Post.tags, {name: 'SQL'})
      .write(User)
      .where(eq(User.name, 'Ada'))
      .insert(User.posts, {title: 'Other'})
      .write(Post)
      .where(eq(Post.title, 'Other'))
      .connect(Post.tags, eq(Post.tags.name, 'SQL'))

    test.equal(
      await db.first(Post, {
        where: eq(Post.title, 'Post'),
        select: {
          tags: Post.tags({
            select: {name: Post.tags.name},
            orderBy: [Post.tags.name]
          })
        }
      }),
      {tags: [{name: 'ORM'}, {name: 'SQL'}]}
    )

    await db
      .write(Post)
      .where(eq(Post.title, 'Post'))
      .disconnect(Post.tags, eq(Post.tags.name, 'ORM'))
      .delete(Post.tags, eq(Post.tags.name, 'SQL'))

    test.equal(
      await db.find(Post, {
        select: {
          title: Post.title,
          tags: Post.tags({select: {name: Post.tags.name}})
        },
        orderBy: [Post.title]
      }),
      [
        {title: 'Other', tags: []},
        {title: 'Post', tags: []}
      ]
    )
    test.equal(await db.find(tags, {select: {name: tags.name}}), [
      {name: 'ORM'}
    ])
  })

  test('write deletes optional one relations after disconnecting them', async () => {
    await db
      .write(Node)
      .insert({name: 'Child'})
      .insert(Node.parent, {name: 'Parent'})
      .write(Node)
      .where(eq(Node.name, 'Child'))
      .delete(Node.parent, eq(Node.parent.name, 'Parent'))

    test.equal(await db.first(nodes, {where: eq(nodes.name, 'Parent')}), null)
    test.equal(
      (await db.first(nodes, {where: eq(nodes.name, 'Child')}))?.parentId,
      null
    )
  })

  test('write resolves one relations around root inserts and scopes', async () => {
    await db
      .write(Post)
      .insert({title: 'Inserted'})
      .insert(Post.author, {name: 'Ada'})

    test.equal(
      await db.first(Post, {
        where: eq(Post.title, 'Inserted'),
        select: {author: Post.author({select: {name: Post.author.name}})}
      }),
      {author: {name: 'Ada'}}
    )

    await db
      .write(users)
      .insert({name: 'Grace'})
      .write(Post)
      .where(eq(Post.title, 'Inserted'))
      .connect(Post.author, eq(Post.author.name, 'Grace'))

    test.equal(
      await db.first(Post, {
        where: eq(Post.title, 'Inserted'),
        select: {author: Post.author({select: {name: Post.author.name}})}
      }),
      {author: {name: 'Grace'}}
    )
  })

  test('write chains unrelated models in one plan', async () => {
    await db.write(User).insert({name: 'Ada'}).write(tags).insert({name: 'ORM'})

    test.equal(await db.count(users), 1)
    test.equal(await db.count(tags), 1)
  })

  test('write retains relation scope across root key updates', async () => {
    await db
      .write(orders)
      .insert({storeId: 'store', orderNumber: 'old', customer: 'Ada'})

    await db
      .write(Order)
      .where(eq(Order.orderNumber, 'old'))
      .update({orderNumber: 'new'})
      .insert(Order.items, {product: 'After update'})

    test.equal(
      await db.first(orderItems, {
        where: eq(orderItems.product, 'After update'),
        select: {
          storeId: orderItems.storeId,
          orderNumber: orderItems.orderNumber
        }
      }),
      {
        storeId: 'store',
        orderNumber: 'new'
      }
    )
  })

  if (db.dialect.runtime !== 'mysql')
    test('write returns native root mutation rows', async () => {
      const returningDb = db as Database<IsPostgres | IsSqlite>
      const [inserted] = await returningDb
        .write(User)
        .insert({name: 'Ada'})
        .insert(User.posts, {title: 'Old'})
        .returning({id: User.id, name: User.name})

      test.ok(inserted.id > 0)
      test.equal(inserted.name, 'Ada')

      const [updated] = await returningDb
        .write(User)
        .where(eq(User.name, 'Ada'))
        .update({name: 'Grace'})
        .update(User.posts, eq(User.posts.title, 'Old'), {title: 'Updated'})
        .returning({id: User.id, name: User.name})

      test.equal(updated, {id: inserted.id, name: 'Grace'})
      test.equal(
        await db.first(Post, {
          where: eq(Post.authorId, inserted.id),
          select: {title: Post.title}
        }),
        {title: 'Updated'}
      )
    })

  test('write plans are atomic when transactions are supported', async () => {
    if (!db.driver.supportsTransactions) return
    await test.throws(
      async () =>
        await db
          .write(User)
          .insert({name: 'Ada'})
          .write(comments)
          .insert({body: 'Missing post'})
    )
    test.equal(await db.count(users), 0)
  })
}
