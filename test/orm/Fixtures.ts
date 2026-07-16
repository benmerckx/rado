import type {DefineTest} from '@alinea/suite'
import type {Database} from '#/core/Database.ts'
import {table} from '#/core/Table.ts'
import {eq, many, one, primaryKey} from '#/index.ts'
import {boolean, id, integer, text, varchar} from '#/universal.ts'

export const users = table('orm_user', {
  id: id(),
  name: text().notNull(),
  email: text(),
  loginCount: integer().notNull().default(0)
})

export const posts = table('orm_post', {
  id: id(),
  authorId: integer()
    .notNull()
    .references(() => users.id),
  title: text().notNull(),
  published: boolean().notNull().default(false)
})

export const comments = table('orm_comment', {
  id: id(),
  postId: integer()
    .notNull()
    .references(() => posts.id),
  body: text().notNull()
})

export const tags = table('orm_tag', {
  id: id(),
  name: text().notNull()
})

export const postTags = table(
  'orm_post_tag',
  {
    postId: integer()
      .notNull()
      .references(() => posts.id),
    tagId: integer()
      .notNull()
      .references(() => tags.id)
  },
  self => [primaryKey(self.postId, self.tagId)]
)

export const nodes = table('orm_node', {
  id: id(),
  parentId: integer().references((): any => nodes.id),
  name: text().notNull()
})

export const orders = table(
  'orm_order',
  {
    storeId: varchar('storeId', {length: 100}).notNull(),
    orderNumber: varchar('orderNumber', {length: 100}).notNull(),
    customer: text().notNull()
  },
  self => [primaryKey(self.storeId, self.orderNumber)]
)

export const orderItems = table('orm_order_item', {
  id: id(),
  storeId: varchar('storeId', {length: 100}).notNull(),
  orderNumber: varchar('orderNumber', {length: 100}).notNull(),
  product: text().notNull()
})

export const orderTags = table(
  'orm_order_tag',
  {
    storeId: varchar('storeId', {length: 100}).notNull(),
    orderNumber: varchar('orderNumber', {length: 100}).notNull(),
    tagId: integer().notNull()
  },
  self => [primaryKey(self.storeId, self.orderNumber, self.tagId)]
)

export const Node = {
  ...nodes,
  parent: one(nodes, {from: nodes.parentId, to: nodes.id})
}

export const Post = {
  ...posts,
  author: one(users, {
    from: posts.authorId,
    to: users.id,
    required: true
  }),
  comments: many(comments, {from: posts.id, to: comments.postId}),
  tags: many(tags, {
    from: posts.id,
    to: tags.id,
    through: {table: postTags, from: postTags.postId, to: postTags.tagId}
  })
}

export const User = {
  ...users,
  posts: many(posts, {from: users.id, to: posts.authorId}),
  publishedPosts: many(posts, {
    from: users.id,
    to: posts.authorId,
    where: eq(posts.published, true)
  })
}

export const UserGraph = {
  ...users,
  posts: many(Post, {from: users.id, to: posts.authorId})
}

export const OrderItem = {
  ...orderItems,
  order: one(orders, {
    from: [orderItems.storeId, orderItems.orderNumber],
    to: [orders.storeId, orders.orderNumber],
    required: true
  })
}

export const Order = {
  ...orders,
  items: many(orderItems, {
    from: [orders.storeId, orders.orderNumber],
    to: [orderItems.storeId, orderItems.orderNumber]
  }),
  tags: many(tags, {
    from: [orders.storeId, orders.orderNumber],
    to: tags.id,
    through: {
      table: orderTags,
      from: [orderTags.storeId, orderTags.orderNumber],
      to: orderTags.tagId
    }
  })
}

const initialized = new WeakSet<Database>()

async function clearORM(db: Database) {
  await db.delete(orderTags)
  await db.delete(orderItems)
  await db.delete(orders)
  await db.delete(postTags)
  await db.delete(comments)
  await db.delete(tags)
  await db.delete(posts)
  await db.delete(users)
  await db.delete(nodes)
}

async function cleanupORM(db: Database) {
  if (!initialized.delete(db)) return
  await db.drop(
    orderTags,
    orderItems,
    orders,
    postTags,
    comments,
    tags,
    posts,
    users,
    nodes
  )
}

export function ormTests(db: Database, test: DefineTest) {
  const wrapped = Object.assign(
    (name: string, run: () => Promise<void>) =>
      test(name, async () => {
        if (!initialized.has(db)) {
          await db.create(
            users,
            posts,
            comments,
            tags,
            postTags,
            nodes,
            orders,
            orderItems,
            orderTags
          )
          initialized.add(db)
        }
        await clearORM(db)
        await run()
      }),
    test
  ) as DefineTest
  return {test: wrapped, cleanup: () => cleanupORM(db)}
}
