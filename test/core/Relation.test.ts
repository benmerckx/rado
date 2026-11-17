import {suite} from '@alinea/suite'
import {alias, eq, exists, many, one, table} from '#/index.ts'
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
const Parent = alias(Node, 'Parent')
const Author = alias(User, 'Author')

const posts = many(Post, User, {authorId: 'id'})
const links = many(PostTag, Post, {postId: 'id'})
const tags = many(Tag, links, {id: 'tagId'})
const parent = one(Parent, Node, {id: 'parentId'})
const author = one(User, eq(User.id, Post.authorId))
const items = many(Item, Order, {storeId: 'storeId', orderNumber: 'number'})

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
    many(Post, User, {authorId: 'name'})
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
      'select (select jsonb_agg(jsonb_build_array(_."name")) from (select "Tag"."name" from "Tag" inner join "PostTag" on "Tag"."id" = "PostTag"."tagId" where "PostTag"."postId" = "Post"."id") as _) as "tags" from "Post"'
    )
    const all = many(Tag, many(PostTag, posts, {postId: 'id'}), {id: 'tagId'})
    test.equal(
      emit(builder.select(all.count()).from(User)),
      'select (select count(*) from "Tag" inner join "PostTag" on "Tag"."id" = "PostTag"."tagId" inner join "Post" on "PostTag"."postId" = "Post"."id" where "Post"."authorId" = "User"."id") from "User"'
    )
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
    many(Tag, links, {name: 'tagId'})
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
