import type {DefineTest} from '@alinea/suite'
import type {IsMysql, IsPostgres} from '#/core/MetaData.ts'
import {
  alias,
  count,
  desc,
  eq,
  exists,
  gt,
  inArray,
  many,
  not,
  one,
  sql,
  table,
  type Database
} from '#/index.ts'
import {boolean, id, integer, text} from '#/universal.ts'

const User = table('RelUser', {
  id: id(),
  name: text().notNull()
})

const Post = table('RelPost', {
  id: id(),
  authorId: integer().notNull(),
  title: text().notNull(),
  published: boolean().notNull()
})

const Tag = table('RelTag', {
  id: id(),
  name: text().notNull()
})

const PostTag = table('RelPostTag', {
  postId: integer().notNull(),
  tagId: integer().notNull()
})

const Node = table('RelNode', {
  id: id(),
  parentId: integer(),
  name: text().notNull()
})
const Parent = alias(Node, 'Parent')

const posts = many(Post, {authorId: User.id})
const author = one(User, {id: Post.authorId}).notNull()
const links = many(PostTag, {postId: Post.id})
const tags = links.many(Tag, {id: PostTag.tagId}).orderBy(Tag.id)
const parent = one(Parent, {id: Node.parentId})

const Account = table('RelAccount', {
  uid: id('account_id'),
  label: text('account_label').notNull()
})

const Entry = table('RelEntry', {
  id: id(),
  owner: integer('owner_id').notNull(),
  text: text().notNull()
})

const entries = many(Entry, {owner: Account.uid})
const owner = one(Account, {uid: Entry.owner}).notNull()

const tables = [User, Post, Tag, PostTag, Node]

export function testRelations(db: Database, test: DefineTest) {
  async function seed() {
    await db.create(...tables)
    await db.insert(User).values([{name: 'Ada'}, {name: 'Bob'}])
    await db.insert(Post).values([
      {authorId: 1, title: 'A', published: true},
      {authorId: 1, title: 'B', published: false}
    ])
    await db.insert(Tag).values([{name: 'sql'}, {name: 'ts'}])
    await db.insert(PostTag).values([
      {postId: 1, tagId: 1},
      {postId: 1, tagId: 2}
    ])
    await db.insert(Node).values([{name: 'root'}, {name: 'leaf', parentId: 1}])
  }

  test('relations', async () => {
    await seed()
    try {
      const users = await db.select({...User, posts}).from(User)
      test.equal(users, [
        {
          id: 1,
          name: 'Ada',
          posts: [
            {id: 1, authorId: 1, title: 'A', published: true},
            {id: 2, authorId: 1, title: 'B', published: false}
          ]
        },
        {id: 2, name: 'Bob', posts: []}
      ])

      const post = await db
        .select({title: Post.title, author})
        .from(Post)
        .where(eq(Post.id, 1))
        .get()
      const name: string = post!.author.name
      test.equal(name, 'Ada')
    } finally {
      await db.drop(...tables)
    }
  })

  test('refined and nested relations', async () => {
    await seed()
    try {
      const latest = posts
        .select({title: Post.title, author: author.select(User.name), tags})
        .where(eq(Post.published, true))
        .orderBy(desc(Post.title))
        .limit(1)
      const user = await db
        .select({name: User.name, latest})
        .from(User)
        .where(eq(User.id, 1))
        .get()
      test.equal(user, {
        name: 'Ada',
        latest: [
          {
            title: 'A',
            author: 'Ada',
            tags: [
              {id: 1, name: 'sql'},
              {id: 2, name: 'ts'}
            ]
          }
        ]
      })
    } finally {
      await db.drop(...tables)
    }
  })

  test('relation filters and counts', async () => {
    await seed()
    try {
      const drafts = posts.where(eq(Post.published, false))
      const withDrafts = await db
        .select(User.name)
        .from(User)
        .where(exists(drafts))
      test.equal(withDrafts, ['Ada'])
      const idle = await db
        .select(User.name)
        .from(User)
        .where(not(exists(posts)))
      test.equal(idle, ['Bob'])
      const counts = await db
        .select({name: User.name, total: posts.count()})
        .from(User)
        .orderBy(User.id)
      test.equal(counts, [
        {name: 'Ada', total: 2},
        {name: 'Bob', total: 0}
      ])
    } finally {
      await db.drop(...tables)
    }
  })

  test('first of many', async () => {
    await seed()
    try {
      const latest = posts.select(Post.title).orderBy(desc(Post.id)).first()
      const users = await db
        .select({name: User.name, latest})
        .from(User)
        .orderBy(User.id)
      test.equal(users, [
        {name: 'Ada', latest: 'B'},
        {name: 'Bob', latest: null}
      ])
    } finally {
      await db.drop(...tables)
    }
  })

  test('scoped writes', async () => {
    await db.create(...tables)
    try {
      const row = {name: 'Ada'}
      // MySQL has no returning, the generated key is all a scope needs
      const ada =
        db.dialect.runtime === 'mysql'
          ? {
              id: (await (<Database<IsMysql>>db).insert(User).values(row))
                .insertId
            }
          : (await (<Database<IsPostgres>>db)
              .insert(User)
              .values(row)
              .returning()
              .get())!
      await db.insert(User).values({name: 'Bob'})
      await db.insert(posts.of(ada)).values([
        {title: 'A', published: true},
        {title: 'B', published: false}
      ])
      await db.insert(posts.of({id: 2})).values({title: 'C', published: false})

      const updated = await db.update(posts.of(ada)).set({published: true})
      test.equal(updated.affectedRows, 2)
      await db.delete(posts.of(ada)).where(eq(Post.title, 'A'))
      const first = await db.select().from(Post).orderBy(Post.id)
      test.equal(first, [
        {id: 2, authorId: 1, title: 'B', published: true},
        {id: 3, authorId: 2, title: 'C', published: false}
      ])

      if (db.dialect.runtime !== 'mysql') {
        const moved = await (<Database<IsPostgres>>db)
          .update(posts.of(ada))
          .set({authorId: 2})
          .returning()
        test.equal(moved, [{id: 2, authorId: 2, title: 'B', published: true}])
        await db
          .update(posts.of({id: 2}))
          .set({authorId: 1})
          .where(eq(Post.id, 2))
      }

      await db.update(author.of(first[1])).set({name: 'Bobby'})
      await db.delete(posts.of(ada))
      const users = await db
        .select({name: User.name, total: posts.count()})
        .from(User)
        .orderBy(User.id)
      test.equal(users, [
        {name: 'Ada', total: 0},
        {name: 'Bobby', total: 1}
      ])
    } finally {
      await db.drop(...tables)
    }
  })

  test('scoped reads', async () => {
    await seed()
    try {
      await db.insert(Post).values({authorId: 2, title: 'C', published: true})
      const ada = {id: 1, name: 'Ada'}
      const bob = posts.of({id: 2})
      test.equal(await db.select().from(posts.of(ada)).orderBy(Post.id), [
        {id: 1, authorId: 1, title: 'A', published: true},
        {id: 2, authorId: 1, title: 'B', published: false}
      ])
      test.equal(
        await db
          .select(Post.title)
          .from(posts.of(ada))
          .where(eq(Post.published, true)),
        ['A']
      )
      test.equal(await db.select(Post.title).from(bob).get(), 'C')
      test.equal(
        await db
          .select(Post.title)
          .from(bob)
          .where(gt(Post.id, 0))
          .where(eq(Post.published, true)),
        ['C']
      )
      test.equal(
        await db
          .select(Tag.name)
          .from(links.of({id: 1}))
          .innerJoin(Tag, eq(Tag.id, PostTag.tagId))
          .orderBy(Tag.id),
        ['sql', 'ts']
      )
      test.equal(
        await db
          .select({title: Post.title, tag: Tag.name})
          .from(bob)
          .leftJoin(PostTag, eq(PostTag.postId, Post.id))
          .leftJoin(Tag, eq(Tag.id, PostTag.tagId)),
        [{title: 'C', tag: null}]
      )
      const mine = db.select({id: Post.id}).from(bob).as('mine')
      test.equal(await db.select(mine.id).from(mine), [3])
      test.equal(
        await db
          .select(User.name)
          .from(User)
          .where(inArray(User.id, db.select(Post.authorId).from(bob))),
        ['Bob']
      )
      test.equal(
        await db
          .select(Post.title)
          .from(bob)
          .union(db.select(Post.title).from(posts.of({id: 3}))),
        ['C']
      )
      test.equal(
        await db
          .select(User.name)
          .from(author.of({authorId: 2}))
          .get(),
        'Bob'
      )
      {
        await using prepared = db
          .select(Post.title)
          .from(posts.of(ada))
          .where(eq(Post.title, sql.placeholder('title')))
          .prepare<{title: string}>('scoped-read')
        test.equal(await prepared.all({title: 'B'}), ['B'])
        test.equal(await prepared.get({title: 'C'}), null)
      }
    } finally {
      await db.drop(...tables)
    }
  })

  test('standalone count', async () => {
    await seed()
    try {
      await db.insert(Post).values({authorId: 2, title: 'C', published: true})
      test.equal(await count(db, Post), 3)
      test.equal(await count(db, Post, eq(Post.published, true)), 2)
      test.equal(
        await count(db, Post, eq(Post.published, true), eq(Post.authorId, 1)),
        1
      )
      test.equal(await count(db, posts.of({id: 1})), 2)
      test.equal(await count(db, posts.of({id: 1}), Post.published), 1)
      test.equal(await count(db, posts.of({id: 3})), 0)
      test.equal(await count(db, Post).get(), 3)
      test.equal(await db.$count(Post, eq(Post.authorId, 2)), 1)
      test.equal(
        await db
          .select({name: User.name, total: count(db, Post)})
          .from(User)
          .orderBy(User.id)
          .get(),
        {name: 'Ada', total: 3}
      )
    } finally {
      await db.drop(...tables)
    }
  })

  test('through relation', async () => {
    await seed()
    try {
      await db.insert(links.of({id: 2})).values([{tagId: 1}, {tagId: 2}])
      await db.delete(links.of({id: 2})).where(eq(PostTag.tagId, 1))
      const tagged = await db
        .select({title: Post.title, tags: tags.select(Tag.name)})
        .from(Post)
        .orderBy(Post.id)
      test.equal(tagged, [
        {title: 'A', tags: ['sql', 'ts']},
        {title: 'B', tags: ['ts']}
      ])
      const used = posts
        .many(PostTag, {postId: Post.id})
        .many(Tag, {id: PostTag.tagId})
      const users = await db
        .select({name: User.name, tags: used.count()})
        .from(User)
        .orderBy(User.id)
      test.equal(users, [
        {name: 'Ada', tags: 3},
        {name: 'Bob', tags: 0}
      ])
    } finally {
      await db.drop(...tables)
    }
  })

  test('every', async () => {
    await seed()
    try {
      const done = await db
        .select(User.name)
        .from(User)
        .where(posts.every(Post.published))
      test.equal(done, ['Bob'])
    } finally {
      await db.drop(...tables)
    }
  })

  test('renamed keys', async () => {
    await db.create(Account, Entry)
    try {
      await db.insert(Account).values([{label: 'A'}, {label: 'B'}])
      const account = (await db.select().from(Account).get())!
      await db.insert(entries.of(account)).values([{text: 'a'}, {text: 'b'}])
      await db.insert(entries.of({uid: 2})).values({text: 'c'})
      await db.delete(entries.of(account)).where(eq(Entry.text, 'a'))
      const entry = (await db.select().from(Entry).orderBy(Entry.id).get())!
      test.equal(entry, {id: 2, owner: 1, text: 'b'})
      await db.update(owner.of(entry)).set({label: 'Z'})
      const accounts = await db
        .select({
          label: Account.label,
          entries: entries.select({
            text: Entry.text,
            of: owner.select(Account.label)
          })
        })
        .from(Account)
        .orderBy(Account.uid)
      test.equal(accounts, [
        {label: 'Z', entries: [{text: 'b', of: 'Z'}]},
        {label: 'B', entries: [{text: 'c', of: 'B'}]}
      ])
    } finally {
      await db.drop(Account, Entry)
    }
  })

  test('self relation', async () => {
    await seed()
    try {
      await db.insert(Node).values({name: 'twig', parentId: 2})
      const up = parent.alias(Node, Parent)
      const nodes = await db
        .select({
          name: Node.name,
          parent: parent.select({
            name: Parent.name,
            parent: up.select({
              name: Node.name,
              parent: parent.select(Parent.name)
            })
          })
        })
        .from(Node)
        .orderBy(Node.id)
      test.equal(nodes, [
        {name: 'root', parent: null},
        {name: 'leaf', parent: {name: 'root', parent: null}},
        {
          name: 'twig',
          parent: {name: 'leaf', parent: {name: 'root', parent: null}}
        }
      ])

      await db.delete(parent.of({parentId: 2}))
      await db.delete(Parent).where(eq(Parent.name, 'twig'))
      test.equal(await db.select(Node.name).from(Node), ['root'])
    } finally {
      await db.drop(...tables)
    }
  })
}
