import type {DefineTest} from '@alinea/suite'
import type {Database} from '#/core/Database.ts'
import type {HasSql} from '#/core/Internal.ts'
import {table} from '#/core/Table.ts'
import type {
  Table,
  TableDefinition,
  TableInsert,
  TableRow
} from '#/core/Table.ts'
import {many, one, primaryKey} from '#/index.ts'
import {boolean, id, integer, text} from '#/universal.ts'

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

export const Node = {
  ...nodes,
  parent: one(nodes, {from: nodes.parentId, to: nodes.id})
}

export const Post = {
  ...posts,
  author: one(users, {from: posts.authorId, to: users.id}),
  comments: many(comments, {from: posts.id, to: comments.postId}),
  tags: many(tags, {
    from: posts.id,
    to: tags.id,
    through: {table: postTags, from: postTags.postId, to: postTags.tagId}
  })
}

export const User = {
  ...users,
  posts: many(posts, {from: users.id, to: posts.authorId})
}

export const UserGraph = {
  ...users,
  posts: many(Post, {from: users.id, to: posts.authorId})
}

export async function insertRow<Definition extends TableDefinition>(
  db: Database,
  target: Table<Definition>,
  value: TableInsert<Definition>,
  where: HasSql<boolean>
): Promise<TableRow<Definition>> {
  await db.insert(target).values(value)
  const inserted = await db.select().from(target).where(where).get()
  if (!inserted) throw new Error('Test fixture could not reload inserted row')
  return inserted as TableRow<Definition>
}

const initialized = new WeakSet<Database>()

async function clearORM(db: Database) {
  await db.delete(postTags)
  await db.delete(comments)
  await db.delete(tags)
  await db.delete(posts)
  await db.delete(users)
  await db.delete(nodes)
}

async function cleanupORM(db: Database) {
  if (!initialized.delete(db)) return
  await db.drop(postTags, comments, tags, posts, users, nodes)
}

export function ormTests(db: Database, test: DefineTest) {
  const wrapped = Object.assign(
    (name: string, run: () => Promise<void>) =>
      test(name, async () => {
        if (!initialized.has(db)) {
          await db.create(users, posts, comments, tags, postTags, nodes)
          initialized.add(db)
        }
        await clearORM(db)
        await run()
      }),
    test
  ) as DefineTest
  return {test: wrapped, cleanup: () => cleanupORM(db)}
}
