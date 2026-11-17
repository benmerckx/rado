import {suite} from '@alinea/suite'
import {alias, eq, exists, many, one, table, view} from '#/index.ts'
import {id, integer, text} from '#/universal.ts'
import {builder, emit} from '../TestUtils.ts'

const User = table('User', {
  id: id(),
  name: text().notNull()
})

const Post = table('Post', {
  id: id(),
  authorId: integer().notNull(),
  title: text().notNull()
})

const Item = table('Item', {
  storeId: integer().notNull(),
  orderNumber: integer().notNull(),
  sku: text().notNull()
})

const Order = table('Order', {
  storeId: integer().notNull(),
  number: integer().notNull()
})

const Tag = table('Tag', {
  id: id(),
  name: text().notNull()
})

const PostTag = table('PostTag', {
  postId: integer().notNull(),
  tagId: integer().notNull()
})

const Node = table('Node', {
  id: id(),
  parentId: integer(),
  name: text().notNull()
})
const Account = table('Account', {
  uid: id('account_id'),
  label: text('account_label').notNull()
})

const Entry = table('Entry', {
  id: id(),
  owner: integer('owner_id').notNull(),
  text: text().notNull()
})

const Parent = alias(Node, 'Parent')
const Author = alias(User, 'Author')

const posts = many(Post, {authorId: User.id})
const links = many(PostTag, {postId: Post.id})
const tags = links.many(Tag, {id: PostTag.tagId})
const parent = one(Parent, {id: Node.parentId})
const author = one(User, eq(User.id, Post.authorId))
const items = many(Item, {storeId: Order.storeId, orderNumber: Order.number})
const entries = many(Entry, {owner: Account.uid})

suite(import.meta, test => {
  test('many', () => {
    const query = builder.select({posts: posts.select(Post.title)}).from(User)
    test.equal(
      emit(query),
      'select (select jsonb_agg(jsonb_build_array(_."title")) from (select "Post"."title" from "Post" where "Post"."authorId" = "User"."id") as _) as "posts" from "User"'
    )
  })

  test('one', () => {
    const query = builder.select({author: author.select(User.name)}).from(Post)
    test.equal(
      emit(query),
      'select (select jsonb_build_array(_."name") from (select "User"."name" from "User" where "User"."id" = "Post"."authorId") as _) as "author" from "Post"'
    )
  })

  test('composite keys', () => {
    const query = builder.select({items: items.select(Item.sku)}).from(Order)
    test.equal(
      emit(query),
      'select (select jsonb_agg(jsonb_build_array(_."sku")) from (select "Item"."sku" from "Item" where ("Item"."storeId" = "Order"."storeId" and "Item"."orderNumber" = "Order"."number")) as _) as "items" from "Order"'
    )
  })

  test('scoped insert', () => {
    const query = builder
      .insert(items.of({storeId: 1, number: 2}))
      .values([{sku: 'a'}, {sku: 'b', storeId: 3}])
    test.equal(
      emit(query),
      'insert into "Item" ("storeId", "orderNumber", "sku") values (1, 2, "a"), (3, 2, "b")'
    )
  })

  test('scoped update and delete', () => {
    const user = {id: 1, name: 'Ada'}
    test.equal(
      emit(builder.update(posts.of(user)).set({title: 'B'})),
      'update "Post" set "title" = "B" where "Post"."authorId" = 1'
    )
    test.equal(
      emit(builder.delete(posts.of(user)).where(eq(Post.title, 'A'))),
      'delete from "Post" where ("Post"."authorId" = 1 and "Post"."title" = "A")'
    )
    test.throws(() => posts.of({} as {id: number}))
  })

  test('write types', () => {
    // @ts-expect-error a condition does not say which column to fill
    test.throws(() => author.of({authorId: 1}))
    // @ts-expect-error a refined relation is for reading
    ;() => posts.where(eq(Post.title, 'A')).of({id: 1})
    // @ts-expect-error the parent key is required
    ;() => posts.of({name: 'Ada'})
    // @ts-expect-error the scope keeps the column types
    builder.insert(posts.of({id: 1})).values({title: 1})
    // @ts-expect-error text does not match an integer key
    many(Post, {authorId: User.name})
    // @ts-expect-error a scope is not a table to select from
    builder.select().from(posts.of({id: 1}))
  })

  test('alias', () => {
    const query = builder
      .select({posts: posts.alias(Post, Author).select(Post.title)})
      .from(Author)
    test.equal(
      emit(query),
      'select (select jsonb_agg(jsonb_build_array(_."title")) from (select "Post"."title" from "Post" where "Post"."authorId" = "Author"."id") as _) as "posts" from "User" as "Author"'
    )
  })

  test('nested self relation', () => {
    const grand = parent.alias(Node, Parent).select(Node.name)
    const query = builder
      .select(parent.select({name: Parent.name, parent: grand}))
      .from(Node)
    test.equal(
      emit(query),
      'select (select jsonb_build_array(_."name", _."parent") from (select "Parent"."name", (select jsonb_build_array(_."name") from (select "Node"."name" from "Node" where "Node"."id" = "Parent"."parentId") as _) as "parent" from "Node" as "Parent" where "Parent"."id" = "Node"."parentId") as _) from "Node"'
    )
  })

  test('scoped delete on an alias', () => {
    test.equal(
      emit(builder.delete(parent.of({parentId: 1}))),
      'delete from "Node" as "Parent" where "Parent"."id" = 1'
    )
    test.equal(
      emit(builder.delete(parent.alias(Node, Parent).of({parentId: 1}))),
      'delete from "Node" where "Node"."id" = 1'
    )
  })

  test('through', () => {
    const query = builder.select({tags: tags.select(Tag.name)}).from(Post)
    test.equal(
      emit(query),
      'select (select jsonb_agg(jsonb_build_array(_."name")) from (select "Tag"."name" from "PostTag" inner join "Tag" on "Tag"."id" = "PostTag"."tagId" where "PostTag"."postId" = "Post"."id") as _) as "tags" from "Post"'
    )
    const all = posts
      .many(PostTag, {postId: Post.id})
      .many(Tag, {id: PostTag.tagId})
    test.equal(
      emit(builder.select(all.count()).from(User)),
      'select (select count(*) from "Post" inner join "PostTag" on "PostTag"."postId" = "Post"."id" inner join "Tag" on "Tag"."id" = "PostTag"."tagId" where "Post"."authorId" = "User"."id") from "User"'
    )
  })

  test('through a filter', () => {
    const recent = posts.where(eq(Post.title, 'A')).orderBy(Post.id).limit(1)
    const query = recent.many(PostTag, {postId: Post.id}).select(PostTag.tagId)
    test.equal(
      emit(builder.select(query).from(User)),
      'select (select jsonb_agg(jsonb_build_array(_."tagId")) from (select "PostTag"."tagId" from "Post" inner join "PostTag" on "PostTag"."postId" = "Post"."id" where ("Post"."authorId" = "User"."id" and "Post"."title" = "A")) as _) from "User"'
    )
    const first = links.many(Tag, {id: PostTag.tagId}).first()
    type Row = Awaited<ReturnType<typeof load>>[number]
    const load = () => builder.select(first.select(Tag.name)).from(Post)
    const name: Row = null
    test.equal(name, null)
  })

  test('through types', () => {
    // @ts-expect-error users are not part of the links
    links.many(Tag, {id: User.id})
    // @ts-expect-error tags have no label
    links.many(Tag, {label: PostTag.tagId})
    // @ts-expect-error the links are not written through the tags
    ;() => tags.of({id: 1})
    // @ts-expect-error the way through hangs under a post
    ;async () => (await builder.select({tags}).from(User))[0].tags[0].name
  })

  test('renamed columns', () => {
    const account = {uid: 1, label: 'A'}
    test.equal(
      emit(builder.select(entries.select(Entry.text)).from(Account)),
      'select (select jsonb_agg(jsonb_build_array(_."text")) from (select "Entry"."text" from "Entry" where "Entry"."owner_id" = "Account"."account_id") as _) from "Account"'
    )
    test.equal(
      emit(builder.insert(entries.of({uid: 1})).values({text: 'A'})),
      'insert into "Entry" ("id", "owner_id", "text") values (default, 1, "A")'
    )
    test.equal(
      emit(builder.delete(entries.of(account))),
      'delete from "Entry" where "Entry"."owner_id" = 1'
    )
    const Owner = alias(Account, 'Owner')
    test.equal(
      emit(builder.select(entries.alias(Entry, Owner).count()).from(Owner)),
      'select (select count(*) from "Entry" where "Entry"."owner_id" = "Owner"."account_id") from "Account" as "Owner"'
    )
    // @ts-expect-error the row is keyed by property, not by column name
    test.throws(() => entries.of({account_id: 1}))
  })

  test('key types', () => {
    const sub = builder.select({id: User.id}).from(User).as('sub')
    // @ts-expect-error a subquery field is not a table field
    test.throws(() => many(Post, {authorId: sub.id}).of({id: 1}))
    const Active = view('Active', {id: integer().notNull()}).as(
      builder.select({id: User.id}).from(User)
    )
    // @ts-expect-error nor is a field of a view
    many(Post, {authorId: Active.id})
    const recent = builder.$with('recent').as(builder.select().from(User))
    // @ts-expect-error or of a common table expression
    many(Post, {authorId: recent.id})
    // @ts-expect-error neither is an expression
    many(Post, {authorId: eq(User.id, 1)})
    // @ts-expect-error keys come from one parent
    many(Item, {storeId: Order.storeId, orderNumber: User.id})
    // @ts-expect-error a table is not its own parent without an alias
    one(Node, {id: Node.parentId})
    // @ts-expect-error posts have no author column
    many(Post, {author: User.id})
    // @ts-expect-error nor one next to a column they do have
    many(Post, {authorId: User.id, author: User.id})
    // @ts-expect-error the parent of an alias has the same keys
    ;() => posts.alias(Post, Tag as any as typeof Order)
    posts.alias(Post, alias(User, 'Writer'))
    const written = many(Post, {authorId: Author.id})
    test.equal(
      emit(builder.update(written.of({id: 1})).set({title: 'B'})),
      emit(builder.update(posts.of({id: 1})).set({title: 'B'}))
    )
    const loose: Array<{id: number}> = []
    for (const user of loose) posts.of(user)
  })

  test('every', () => {
    const query = builder
      .select(User.name)
      .from(User)
      .where(posts.every(eq(Post.title, 'A')))
    test.equal(
      emit(query),
      'select "User"."name" from "User" where not exists (select "Post"."id", "Post"."authorId", "Post"."title" from "Post" where ("Post"."authorId" = "User"."id" and not "Post"."title" = "A"))'
    )
  })

  test('parent types', async () => {
    const misplaced = builder.select({posts}).from(Post)
    type Row = Awaited<typeof misplaced>[number]
    const outside: Row['posts'] = 'needs User in from'
    test.equal(outside, 'needs User in from')
    const joined = builder
      .select({posts})
      .from(Post)
      .innerJoin(User, eq(User.id, Post.authorId))
    type Joined = Awaited<typeof joined>[number]
    const title: Joined['posts'][number]['title'] = 'A'
    test.equal(title, 'A')
    posts.select({tags})
    // @ts-expect-error posts hang under a user
    posts.select({posts})
    // @ts-expect-error a relation is aliased with its own tables
    ;() => posts.alias(User, Post)
    // @ts-expect-error tag ids are numbers
    links.many(Tag, {name: PostTag.tagId})
  })

  test('exists and count', () => {
    const query = builder
      .select(posts.count())
      .from(User)
      .where(exists(posts.where(eq(Post.title, 'A'))))
    test.equal(
      emit(query),
      'select (select count(*) from "Post" where "Post"."authorId" = "User"."id") from "User" where exists (select "Post"."id", "Post"."authorId", "Post"."title" from "Post" where ("Post"."authorId" = "User"."id" and "Post"."title" = "A"))'
    )
  })
})
