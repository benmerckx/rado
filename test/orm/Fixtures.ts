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

export const compositeParents = table(
  'orm_composite_parent',
  {
    tenant: varchar('tenant', {length: 100}).notNull(),
    code: varchar('code', {length: 100}).notNull(),
    label: text().notNull()
  },
  self => [primaryKey(self.tenant, self.code)]
)

export const compositeChildren = table('orm_composite_child', {
  id: id(),
  tenant: varchar('tenant', {length: 100}).notNull(),
  parentCode: varchar('parentCode', {length: 100}).notNull(),
  title: text().notNull()
})

export const compositeParentTags = table(
  'orm_composite_parent_tag',
  {
    tenant: varchar('tenant', {length: 100}).notNull(),
    parentCode: varchar('parentCode', {length: 100}).notNull(),
    tagId: integer().notNull()
  },
  self => [primaryKey(self.tenant, self.parentCode, self.tagId)]
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

export const CompositeChild = {
  ...compositeChildren,
  parent: one(compositeParents, {
    from: [compositeChildren.tenant, compositeChildren.parentCode],
    to: [compositeParents.tenant, compositeParents.code],
    required: true
  })
}

export const CompositeParent = {
  ...compositeParents,
  children: many(compositeChildren, {
    from: [compositeParents.tenant, compositeParents.code],
    to: [compositeChildren.tenant, compositeChildren.parentCode]
  }),
  tags: many(tags, {
    from: [compositeParents.tenant, compositeParents.code],
    to: tags.id,
    through: {
      table: compositeParentTags,
      from: [compositeParentTags.tenant, compositeParentTags.parentCode],
      to: compositeParentTags.tagId
    }
  })
}

const initialized = new WeakSet<Database>()

async function clearORM(db: Database) {
  await db.delete(compositeParentTags)
  await db.delete(compositeChildren)
  await db.delete(compositeParents)
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
    compositeParentTags,
    compositeChildren,
    compositeParents,
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
            compositeParents,
            compositeChildren,
            compositeParentTags
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
