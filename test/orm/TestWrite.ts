import type {DefineTest} from '@alinea/suite'
import type {Database} from '#/core/Database.ts'
import type {IsPostgres, IsSqlite} from '#/core/MetaData.ts'
import {eq, many, sql, table} from '#/index.ts'
import {boolean, id, integer, json, text} from '#/universal.ts'
import {
  comments,
  Node,
  nodes,
  Order,
  orderItems,
  orders,
  Post,
  posts,
  postTags,
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

  test('empty scopes do not create or change related rows', async () => {
    await db
      .write(User)
      .insert({name: 'Ada'})
      .insert(User.posts, {title: 'Post'})
    await db
      .write(Post)
      .where(eq(Post.title, 'Post'))
      .insert(Post.tags, {name: 'Keep'})
    await db
      .write(Post)
      .where(eq(Post.title, 'Missing'))
      .update(Post.tags, eq(Post.tags.name, 'Keep'), {name: 'Wrong'})
      .delete(Post.tags, eq(Post.tags.name, 'Keep'))
      .insert(Post.tags, {name: 'Orphan'})
    await db
      .write(Post)
      .where(eq(Post.title, 'Missing'))
      .insert(Post.author, {name: 'Orphan'})
    await db.write(Post).insert([]).insert(Post.author, {name: 'Orphan'})
    test.equal(await db.find(tags, {select: {name: tags.name}}), [
      {name: 'Keep'}
    ])
    test.equal(await db.count(postTags), 1)
    test.equal(await db.count(users), 1)
  })

  test('root field and author changes use one root mutation', async () => {
    await db
      .write(Post)
      .insert({title: 'Original'})
      .insert(Post.author, {name: 'Ada'})
    await db.write(User).insert({name: 'Grace'})
    await db
      .write(Post)
      .where(eq(Post.title, 'Original'))
      .update({title: 'Changed'})
      .connect(Post.author, eq(Post.author.name, 'Grace'))
      .insert(Post.comments, {body: 'Hello'})
    test.equal(
      await db.first(Post, {
        select: {
          title: Post.title,
          author: Post.author({select: {name: Post.author.name}}),
          comments: Post.comments({select: {body: Post.comments.body}})
        }
      }),
      {title: 'Changed', author: {name: 'Grace'}, comments: [{body: 'Hello'}]}
    )
  })

  test('conditional disconnects retain the other parents and clear subsequent scopes', async () => {
    await db
      .write(Node)
      .insert({name: 'Child A'})
      .insert(Node.parent, {name: 'Parent A'})
    await db
      .write(Node)
      .insert({name: 'Child B'})
      .insert(Node.parent, {name: 'Parent B'})
    await db
      .write(Node)
      .where(sql`true`)
      .disconnect(Node.parent, eq(Node.parent.name, 'Parent A'))
      .update(Node.parent, eq(Node.parent.name, 'Parent A'), {name: 'Wrong'})
    test.equal(
      await db.first(Node, {
        where: eq(Node.name, 'Child A'),
        select: {parent: Node.parent()}
      }),
      {parent: null}
    )
    test.equal(
      await db.first(Node, {
        where: eq(Node.name, 'Child B'),
        select: {parent: Node.parent({select: {name: Node.parent.name}})}
      }),
      {parent: {name: 'Parent B'}}
    )
    test.equal(await db.count(Node, {where: eq(Node.name, 'Parent A')}), 1)
  })

  test('write validates dependency phases before execution', async () => {
    const plan = db.write(Post).where(eq(Post.title, 'Post'))
    test.throws(() =>
      (plan.insert(Post.comments, {body: 'Hello'}) as any).connect(
        Post.author,
        eq(Post.author.name, 'Ada')
      )
    )
    test.throws(() =>
      plan
        .connect(Post.author, eq(Post.author.name, 'Ada'))
        .connect(Post.author, eq(Post.author.name, 'Grace'))
    )
    test.throws(() =>
      plan
        .update({authorId: 1})
        .connect(Post.author, eq(Post.author.name, 'Ada'))
    )
    test.throws(() =>
      (plan.delete() as any).insert(Post.comments, {body: 'Hello'})
    )
    test.equal(await db.count(posts), 0)
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

  test('generated root keys use returning or fail before a mysql insert', async () => {
    const root = table('orm_write_identity', {id: id(), name: text()})
    const child = table('orm_write_identity_child', {
      owner: integer(),
      body: text()
    })
    const Root = {
      ...root,
      children: many(child, {from: root.id, to: child.owner})
    }
    await db.create(root, child)
    try {
      const plan = db
        .write(Root)
        .insert({name: 'Root'})
        .insert(Root.children, {body: 'Child'})
      if (db.dialect.runtime === 'mysql') {
        await test.throws(async () => await plan)
        test.equal(await db.count(root), 0)
        test.equal(await db.count(child), 0)
      } else {
        const result = await (db as Database<IsPostgres | IsSqlite>)
          .write(Root)
          .insert({name: 'Root'})
          .insert(Root.children, {body: 'Child'})
          .select({
            id: Root.id,
            children: Root.children({select: {owner: Root.children.owner}})
          })
        test.ok(result[0]!.id > 0)
        test.equal(result[0]!.children, [{owner: result[0]!.id}])
      }
    } finally {
      await db.drop(child, root)
    }
  })

  test('client relation defaults are evaluated once and shared with children', async () => {
    let calls = 0
    const root = table('orm_write_client_default', {
      key: text().$default(() => `key-${++calls}`)
    })
    const child = table('orm_write_client_child', {owner: text()})
    const Root = {
      ...root,
      children: many(child, {from: root.key, to: child.owner})
    }
    await db.create(root, child)
    try {
      await db.write(Root).insert({}).insert(Root.children, [{}, {}])
      test.equal(calls, 1)
      test.equal(await db.find(root), [{key: 'key-1'}])
      test.equal(await db.find(child), [{owner: 'key-1'}, {owner: 'key-1'}])
      if (db.dialect.runtime === 'mysql') {
        await test.throws(
          async () =>
            await db
              .write(Root)
              .where(eq(Root.key, 'key-1'))
              .update({key: sql`upper(${Root.key})`})
              .insert(Root.children, {})
        )
        test.equal(await db.find(root), [{key: 'key-1'}])
      }
    } finally {
      await db.drop(child, root)
    }
  })

  if (db.dialect.runtime !== 'mysql') {
    const returningDb = db as Database<IsPostgres | IsSqlite>
    test('computed root values feed dependents without public returning', async () => {
      await db
        .write(Order)
        .insert({storeId: 'store', orderNumber: 'old', customer: 'Ada'})
      await db
        .write(Order)
        .where(eq(Order.orderNumber, 'old'))
        .update({orderNumber: sql`${Order.orderNumber} || '-new'`})
        .insert(Order.items, {product: 'Child'})
      test.equal(
        await db.find(orderItems, {select: {number: orderItems.orderNumber}}),
        [{number: 'old-new'}]
      )
    })

    test('select returns captured roots with completed relations', async () => {
      const result = await returningDb
        .write(Post)
        .insert({title: 'Hello'})
        .insert(Post.author, {name: 'Ada'})
        .insert(Post.comments, [{body: 'First'}, {body: 'Second'}])
        .insert(Post.tags, {name: 'SQL'})
        .select({
          title: Post.title,
          published: Post.published,
          author: Post.author({select: {name: Post.author.name}}),
          comments: Post.comments({
            select: {body: Post.comments.body},
            orderBy: [Post.comments.body]
          }),
          tags: Post.tags({select: {name: Post.tags.name}})
        })
      test.equal(result, [
        {
          title: 'Hello',
          published: false,
          author: {name: 'Ada'},
          comments: [{body: 'First'}, {body: 'Second'}],
          tags: [{name: 'SQL'}]
        }
      ])
      const updated = await returningDb
        .write(Post)
        .where(eq(Post.title, 'Hello'))
        .update({title: 'Updated'})
        .insert(Post.comments, {body: 'Third'})
        .select({
          title: Post.title,
          comments: Post.comments({
            select: {body: Post.comments.body},
            orderBy: [Post.comments.body]
          })
        })
      test.equal(updated, [
        {
          title: 'Updated',
          comments: [{body: 'First'}, {body: 'Second'}, {body: 'Third'}]
        }
      ])
      test.equal(
        await returningDb
          .write(Post)
          .where(eq(Post.title, 'Missing'))
          .select({id: Post.id}),
        []
      )
    })

    test('select keeps duplicate roots and scopes self relations', async () => {
      const result = await returningDb
        .write(Node)
        .insert([{name: 'Child'}, {name: 'Child'}])
        .insert(Node.parent, {name: 'Parent'})
        .select({
          name: Node.name,
          parent: Node.parent({select: {name: Node.parent.name}})
        })
      test.equal(result, [
        {name: 'Child', parent: {name: 'Parent'}},
        {name: 'Child', parent: {name: 'Parent'}}
      ])
    })

    test('select handles generated relation fields, renamed columns, and keyless roots', async () => {
      const root = table('orm_write_keyless', {
        token: text('root_token').notNull().default('generated'),
        active: boolean().notNull().default(true),
        payload: json<{ok: boolean}>().$default(() => ({ok: true}))
      })
      const child = table('orm_write_generated', {
        id: id(),
        owner: text('owner_token'),
        body: text()
      })
      const Root = {
        ...root,
        children: many(child, {from: root.token, to: child.owner})
      }
      await db.create(root, child)
      try {
        const result = await returningDb
          .write(Root)
          .insert([{}, {}])
          .insert(Root.children, {body: 'Child'})
          .select({
            token: Root.token,
            active: Root.active,
            payload: Root.payload,
            children: Root.children({select: {body: Root.children.body}})
          })
        const expected = {
          token: 'generated',
          active: true,
          payload: {ok: true},
          children: [{body: 'Child'}, {body: 'Child'}]
        }
        test.equal(result, [expected, expected])
        const deleted = await returningDb
          .write(root)
          .where(eq(root.token, 'generated'))
          .delete()
          .select({token: root.token})
        test.equal(deleted, [{token: 'generated'}, {token: 'generated'}])
      } finally {
        await db.drop(child, root)
      }
    })

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
  }

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
