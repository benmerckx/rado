// Type-level exercise of the ORM API sketch in src/orm.ts.
// Nothing here runs — it exists to verify inference in the editor/CI.
// Each section shows the drizzle equivalent (from the drizzle relational
// queries docs) next to the rado version.

import {table} from '../../src/core/Table.ts'
import {eq, gt, like, sql} from '../../src/index.ts'
import type {Database} from '../../src/index.ts'
import * as orm from '../../src/orm.ts'
import {boolean, id, integer, text} from '../../src/universal.ts'

declare const db: Database

// ── Schema ─────────────────────────────────────────────────────────────────
// Tables are module-private by convention: every column field passes through
// the model spread (User.name is the same Field as users.name), so the model
// is the only handle application code needs.

const users = table('user', {
  id: id(),
  name: text().notNull(),
  email: text(),
  loginCount: integer().notNull().default(0),
  invitedBy: integer().references((): any => users.id)
})

const posts = table('post', {
  id: id(),
  authorId: integer()
    .notNull()
    .references(() => users.id),
  title: text().notNull(),
  published: boolean().notNull().default(false)
})

const comments = table('comment', {
  id: id(),
  postId: integer()
    .notNull()
    .references(() => posts.id),
  authorId: integer()
    .notNull()
    .references(() => users.id),
  body: text().notNull()
})

const groups = table('group', {
  id: id(),
  name: text().notNull()
})

const usersToGroups = table('users_to_groups', {
  userId: integer()
    .notNull()
    .references(() => users.id),
  groupId: integer()
    .notNull()
    .references(() => groups.id)
})

// ── Models ─────────────────────────────────────────────────────────────────
//
// drizzle needs a separate relations registry and a schema-typed client:
//
//   export const usersRelations = relations(users, ({one, many}) => ({
//     posts: many(posts),
//     invitee: one(users, {fields: [users.invitedBy], references: [users.id]}),
//     usersToGroups: many(usersToGroups)
//   }))
//   const db = drizzle(client, {schema: {users, posts, usersRelations, ...}})
//
// rado: a model is a plain spread — table + relation pointers, no client
// coupling. Relations target tables, which keeps model declarations acyclic.

const User = {
  ...users,
  posts: orm.many(posts, {onRemove: 'delete'}),
  invitee: orm.one(users, {fields: [users.invitedBy], references: [users.id]}),
  groups: orm.many(groups, {through: usersToGroups, onRemove: 'detach'})
}

const Post = {
  ...posts,
  author: orm.one(users),
  comments: orm.many(comments, {onRemove: 'delete'})
}

const Comment = {
  ...comments,
  author: orm.one(users)
}

// ── Type assertion helpers ─────────────────────────────────────────────────

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
type Expect<T extends true> = T
/** Flatten intersections so Equal can compare structurally. */
type Flat<T> = {[K in keyof T]: T[K]} & {}

type UserRow = {
  id: number
  name: string
  email: string | null
  loginCount: number
  invitedBy: number | null
}
type PostRow = {
  id: number
  authorId: number
  title: string
  published: boolean
}

// A model still behaves as a Table at the type level:
type _ModelIsTable = Expect<Equal<orm.ModelRow<typeof User>, UserRow>>

// ── Reading ────────────────────────────────────────────────────────────────

async function reading() {
  // drizzle: db.query.users.findFirst({where: eq(users.id, 1)})
  const user = await orm.get(db, {from: User, id: 1})
  type _ = Expect<Equal<typeof user, UserRow | null>>

  // drizzle: db.query.users.findMany({with: {posts: true}})
  // columns(User) = all columns, no relations; then pick relations explicitly
  const withPosts = await orm.find(db, {
    from: User,
    select: {...orm.columns(User), posts: User.posts}
  })
  type _2 = Expect<
    Equal<typeof withPosts, Array<Flat<UserRow & {posts: Array<PostRow>}>>>
  >

  // Everything — all columns and all relations — is one spread of the model:
  const everything = await orm.get(db, {
    from: User,
    id: 1,
    select: {...User}
  })

  // drizzle: partial fields
  //   db.query.users.findMany({
  //     columns: {name: true},                         // boolean maps
  //     with: {posts: {columns: {title: true}}}
  //   })
  const partial = await orm.find(db, {
    from: User,
    select: {
      name: User.name, // field pointers — go-to-def and rename work
      posts: User.posts.select({title: Post.title})
    },
    where: like(User.email, '%@example.com')
  })
  type _3 = Expect<
    Equal<typeof partial, Array<{name: string; posts: Array<{title: string}>}>>
  >

  // drizzle: nested with, two levels + filters/order/limit on the nested level
  //   db.query.users.findMany({
  //     with: {
  //       posts: {
  //         where: gt(posts.id, 10),
  //         orderBy: [desc(posts.id)],
  //         limit: 5,
  //         with: {comments: {with: {author: true}}}
  //       }
  //     }
  //   })
  const deep = await orm.find(db, {
    from: User,
    select: {
      ...orm.columns(User),
      posts: User.posts
        .select({
          title: Post.title,
          comments: Post.comments.select({
            body: Comment.body,
            author: Comment.author.select({name: User.name})
          })
        })
        .where(gt(Post.id, 10))
        .orderBy(sql`${Post.id} desc`)
        .limit(5)
    }
  })
  type _4 = Expect<
    Equal<
      typeof deep,
      Array<
        Flat<
          UserRow & {
            posts: Array<{
              title: string
              comments: Array<{body: string; author: {name: string} | null}>
            }>
          }
        >
      >
    >
  >

  // drizzle: extras (computed fields)
  //   db.query.users.findMany({
  //     extras: {lowerName: sql`lower(${users.name})`.as('lower_name')}
  //   })
  const extras = await orm.find(db, {
    from: User,
    select: {
      ...orm.columns(User),
      lowerName: sql<string>`lower(${User.name})`,
      postCount: User.posts.count() // drizzle RQB cannot do this
    }
  })
  type _5 = Expect<
    Equal<
      typeof extras,
      Array<Flat<UserRow & {lowerName: string; postCount: number}>>
    >
  >

  // drizzle: many-to-many requires modeling the junction and flattening:
  //   db.query.users.findMany({
  //     with: {usersToGroups: {columns: {}, with: {group: true}}}
  //   })
  //   // → row.usersToGroups.map(j => j.group)
  // rado: `through` makes the junction invisible:
  const withGroups = await orm.find(db, {
    from: User,
    select: {name: User.name, groups: User.groups}
  })
  type _6 = Expect<
    Equal<
      typeof withGroups,
      Array<{name: string; groups: Array<{id: number; name: string}>}>
    >
  >

  // Self relation (drizzle: one(users, {fields, references}))
  const invited = await orm.first(db, {
    from: User,
    select: {name: User.name, invitee: User.invitee.select({name: User.name})}
  })
  type _7 = Expect<
    Equal<typeof invited, {name: string; invitee: {name: string} | null} | null>
  >

  // Filter parents by their relations — drizzle RQB v1 cannot express this:
  // users with at least one published post
  const authors = await orm.find(db, {
    from: User,
    where: User.posts.some(eq(Post.published, true))
  })
  // users without posts
  const lurkers = await orm.find(db, {
    from: User,
    where: User.posts.none()
  })

  // Pagination: count shares the find filter
  const page = await orm.find(db, {
    from: User,
    where: like(User.email, '%@example.com'),
    limit: 20,
    offset: 40
  })
  const total = await orm.count(db, {
    from: User,
    where: like(User.email, '%@example.com')
  })
  type _8 = Expect<Equal<typeof total, number>>
}

// ── Writing ────────────────────────────────────────────────────────────────

async function writing() {
  // drizzle has no nested writes — wiring, ordering and the transaction are
  // all manual:
  //   await db.transaction(async tx => {
  //     const [u] = await tx.insert(users).values({name: 'Ada'}).returning()
  //     await tx.insert(posts).values({title: 'Hello', authorId: u.id})
  //     await tx.update(posts).set({title: 'Edited'}).where(eq(posts.id, 4))
  //   })
  const saved = await orm.save(db, User, {
    name: 'Ada',
    posts: [
      {title: 'Hello'}, // no pk → INSERT, authorId wired automatically
      {id: 4, title: 'Edited'} // pk → UPDATE (and reparent if needed)
    ]
  })
  saved.id satisfies number
  saved.posts[0].id satisfies number

  // m2m graph: junction rows created implicitly, new groups inserted first
  const grouped = await orm.save(db, User, {
    name: 'Grace',
    groups: [{name: 'admins'}, {id: 2}] // insert + attach existing
  })
  grouped.groups satisfies Array<{id: number; name: string}>

  // Bulk: several graphs, one transaction (seeding/imports)
  const seeded = await orm.saveMany(db, User, [
    {name: 'Ada', posts: [{title: 'Hello'}]},
    {name: 'Grace'}
  ])
  seeded[0].id satisfies number

  // Incremental edits, builder style: ops chain on save() and execute
  // together with the graph in one transaction when awaited
  const user = (await orm.get(db, {from: User, id: 1, select: {...User}}))!
  const updated = await orm
    .save(db, User, user)
    .set({name: 'Ada Lovelace'})
    .increment(User.loginCount) // atomic, no read
    .unset(User.email)
    .add(User.posts, {title: 'New post'})
    .remove(User.posts, user.posts[0]) // onRemove: delete
    .set(User.groups, [{id: 5}]) // reconcile (detach others)
  updated.id satisfies number

  // To-one relations: set or detach
  const post = (await orm.get(db, {from: Post, id: 4, select: {...Post}}))!
  await orm.save(db, Post, post).set(Post.author, {id: 2}) // reassign author
  // detach: typechecks, but save() rejects it at runtime here because
  // authorId is notNull — the FK's nullability is only known at runtime
  await orm.save(db, Post, post).set(Post.author, null)

  // drizzle counter update:
  //   await db.update(users)
  //     .set({loginCount: sql`${users.loginCount} + 1`})
  //     .where(eq(users.id, 1))
  // rado: orm.increment above

  // Works inside transactions unchanged (Transaction extends Database):
  //   await db.transaction(async tx => {
  //     await orm.save(tx, User, ...)
  //   })

  // drizzle: db.delete(users).where(eq(users.id, 1))
  await orm.destroy(db, User, 1)
  await orm.destroy(db, User, user)
}
