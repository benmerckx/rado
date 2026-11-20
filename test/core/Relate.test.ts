import {suite} from '@alinea/suite'
import {Builder} from '#/core/Builder.ts'
import {getCreate, getTable} from '#/core/Internal.ts'
import type {IsPostgres} from '#/core/MetaData.ts'
import {alias, eq, many, max, relate, table} from '#/index.ts'
import {id, integer, text} from '#/universal.ts'
import * as tables from '../integration/bundle/Post.ts'
import {Node, Parent, Post, Tag, User} from '../integration/bundle/schema.ts'
import {builder, emit} from '../TestUtils.ts'

suite(import.meta, test => {
  test('related table', () => {
    test.equal(Object.keys(User), ['id', 'name', 'posts'])
    test.equal(getTable(Post), getTable(tables.Post))
    test.equal(Post.title, tables.Post.title)
    test.equal(emit(getCreate(Post)[0]), emit(getCreate(tables.Post)[0]))
    test.equal(
      emit(builder.select().from(User)),
      'select "BundleUser"."id", "BundleUser"."name" from "BundleUser"'
    )
    test.equal(
      emit(builder.update(User).set({name: 'A'}).where(eq(User.id, 1))),
      'update "BundleUser" set "name" = "A" where "BundleUser"."id" = 1'
    )
  })

  test('relations', () => {
    const query = builder
      .select({...User, posts: User.posts.select(Post.title)})
      .from(User)
    test.equal(
      emit(query),
      'select "BundleUser"."id", "BundleUser"."name", (select jsonb_agg(jsonb_build_array(_."title")) from (select "BundlePost"."title" from "BundlePost" where "BundlePost"."authorId" = "BundleUser"."id") as _) as "posts" from "BundleUser"'
    )
    test.equal(
      emit(builder.insert(User.posts.of({id: 1})).values({title: 'A'})),
      'insert into "BundlePost" ("id", "authorId", "title") values (default, 1, "A")'
    )
    test.equal(
      emit(builder.select(Post.tags.select(Tag.name)).from(Post)),
      'select (select jsonb_agg(jsonb_build_array(_."name")) from (select "BundleTag"."name" from "BundlePostTag" inner join "BundleTag" on "BundleTag"."id" = "BundlePostTag"."tagId" where "BundlePostTag"."postId" = "BundlePost"."id") as _) from "BundlePost"'
    )
  })

  test('alias', () => {
    const Author = alias(User, 'Author')
    test.equal('posts' in Author, false)
    const posts = User.posts.alias(Post, Author).select(Post.title)
    test.equal(
      emit(builder.select(posts).from(Author)),
      'select (select jsonb_agg(jsonb_build_array(_."title")) from (select "BundlePost"."title" from "BundlePost" where "BundlePost"."authorId" = "Author"."id") as _) from "BundleUser" as "Author"'
    )
    const grand = Parent.parent.select(Node.name)
    const query = builder
      .select(Node.parent.select({name: Parent.name, parent: grand}))
      .from(Node)
    test.equal(
      emit(query),
      'select (select jsonb_build_array(_."name", _."parent") from (select "BundleParent"."name", (select jsonb_build_array(_."name") from (select "BundleNode"."name" from "BundleNode" where "BundleNode"."id" = "BundleParent"."parentId") as _) as "parent" from "BundleNode" as "BundleParent" where "BundleParent"."id" = "BundleNode"."parentId") as _) from "BundleNode"'
    )
  })

  test('columns only', () => {
    const columns =
      'select "BundleUser"."id", "BundleUser"."name" from "BundleUser"'
    test.equal(emit(builder.select(User).from(User)), columns)
    test.equal(
      emit(builder.select({user: User}).from(User)),
      'select "BundleUser"."id", "BundleUser"."name" from "BundleUser"'
    )
    test.equal(
      emit(new Builder<IsPostgres>().update(User).set({name: 'A'}).returning()),
      'update "BundleUser" set "name" = "A" returning "id", "name"'
    )
    test.equal(
      emit(
        builder.select().from(User).innerJoin(Post, eq(Post.authorId, User.id))
      ),
      'select "BundleUser"."id", "BundleUser"."name", "BundlePost"."id" as "id_", "BundlePost"."authorId", "BundlePost"."title" from "BundleUser" inner join "BundlePost" on "BundlePost"."authorId" = "BundleUser"."id"'
    )
  })

  test('extras', () => {
    const total =
      '(select count(*) from "BundlePost" where "BundlePost"."authorId" = "BundleUser"."id") as "total" from "BundleUser"'
    test.equal(
      emit(builder.select(User, {total: User.posts.count()}).from(User)),
      `select "BundleUser"."id", "BundleUser"."name", ${total}`
    )
    test.equal(
      emit(
        builder.selectDistinct(User, {total: User.posts.count()}).from(User)
      ),
      `select distinct "BundleUser"."id", "BundleUser"."name", ${total}`
    )
    const on = eq(Post.authorId, User.id)
    test.equal(
      emit(
        builder
          .select(User, {last: max(Post.id)})
          .from(User)
          .leftJoin(Post, on)
          .groupBy(User.id)
      ),
      'select "BundleUser"."id", "BundleUser"."name", max("BundlePost"."id") as "last" from "BundleUser" left join "BundlePost" on "BundlePost"."authorId" = "BundleUser"."id" group by "BundleUser"."id"'
    )
    test.equal(
      emit(
        new Builder<IsPostgres>()
          .selectDistinctOn([User.name], User, {upper: User.name})
          .from(User)
      ),
      'select distinct on ("BundleUser"."name") "BundleUser"."id", "BundleUser"."name", "BundleUser"."name" as "upper" from "BundleUser"'
    )
    const posts = User.posts.select(Post, {
      author: Post.author.select(User.name)
    })
    test.equal(
      emit(builder.select(posts).from(User)),
      'select (select jsonb_agg(jsonb_build_array(_."id", _."authorId", _."title", _."author")) from (select "BundlePost"."id", "BundlePost"."authorId", "BundlePost"."title", (select jsonb_build_array(_."name") from (select "BundleUser"."name" from "BundleUser" where "BundleUser"."id" = "BundlePost"."authorId") as _) as "author" from "BundlePost" where "BundlePost"."authorId" = "BundleUser"."id") as _) from "BundleUser"'
    )
  })

  test('subquery', () => {
    const sub = builder.select(User).from(User).as('sub')
    test.equal(Object.keys(sub), ['id', 'name'])
    // @ts-expect-error a subquery has the columns
    test.equal(sub.posts, undefined)
    test.equal(
      emit(builder.select(sub.name).from(sub)),
      'select "sub"."name" from (select "BundleUser"."id", "BundleUser"."name" from "BundleUser") as "sub"'
    )
  })

  test('spread', () => {
    test.equal(Object.keys({...User}), ['id', 'name', 'posts'])
    test.equal(
      emit(builder.select({...Tag, upper: Tag.name}).from(Tag)),
      emit(builder.select(Tag, {upper: Tag.name}).from(Tag))
    )
  })

  test('types', () => {
    const plain = builder.select().from(User)
    type Plain = Awaited<typeof plain>[number]
    const row: Plain = {id: 1, name: 'Ada'}
    test.equal(Object.keys(row), ['id', 'name'])
    const whole = builder.select(User).from(User)
    const same: Awaited<typeof whole>[number] = row
    const nested = builder.select({user: User}).from(User)
    const inner: Awaited<typeof nested>[number]['user'] = same
    test.equal(inner, row)
    // @ts-expect-error relations are not columns to insert
    builder.insert(User).values({name: 'Ada', posts: []})
    // @ts-expect-error an alias has no relations
    alias(User, 'Author').posts

    const extras = builder
      .select(User, {total: User.posts.count(), posts: User.posts})
      .from(User)
    type Extras = Awaited<typeof extras>[number]
    const extra: Extras = {id: 1, name: 'Ada', total: 1, posts: []}
    // @ts-expect-error total is a number
    const wrong: Extras = {...extra, total: 'one'}
    test.equal(wrong.total, 'one')
    const replaced = builder.select(User, {name: User.posts.count()}).from(User)
    const name: Awaited<typeof replaced>[number]['name'] = 1
    test.equal(name, 1)
    // @ts-expect-error extras come with a table
    const loose = () => builder.select({id: User.id}, {total: 1})
    test.throws(loose)

    // The relations in a spread are loaded, and the row says so
    const spread = builder.select({...User}).from(User)
    const titles: Array<string> = []
    for (const user of [] as Awaited<typeof spread>)
      for (const post of user.posts) titles.push(post.title)
    test.equal(titles, [])

    const {posts} = User
    const loaded = builder.select({posts, author: Post.author}).from(User)
    type Loaded = Awaited<typeof loaded>[number]
    const title: Loaded['posts'][number]['title'] = 'A'
    test.equal(title, 'A')
    // @ts-expect-error posts hang under a user
    posts.select({posts})
    // @ts-expect-error posts hang under a user
    posts.select(Post, {posts})
    posts.select({author: Post.author})
    const authored = posts.select(Post, {author: Post.author.select(User.name)})
    const by = builder.select({authored}).from(User)
    const author: Awaited<typeof by>[number]['authored'][number]['author'] =
      'Ada'
    test.equal(author, 'Ada')

    // @ts-expect-error an author hangs under a post
    relate(tables.Tag, {author: Post.author})
    relate(tables.Tag, {posts: many(Post, eq(Post.id, Tag.id))})
    // @ts-expect-error name is taken by a column
    relate(tables.Tag, {name: many(Post, eq(Post.id, Tag.id))})
    const Rel = table('Rel', {id: id(), rel: text(), userId: integer()})
    const users = many(User, {id: Rel.userId})
    test.equal(relate(Rel, {users}).rel, Rel.rel)
    const twice = relate(relate(Rel, {users}), {again: users})
    test.equal(twice.users, twice.again)
  })
})
