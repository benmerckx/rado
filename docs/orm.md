# ORM design (orm3)

Status: design and prototype of reads, scoped writes, the gaps that were
left against Drizzle and Prisma (see "Gaps closed") and bundling relations
with their table, flat (see "Bundling"). Code lives in
`src/core/expr/Relation.ts`, tests in `test/integration/TestRelations.ts`,
`test/integration/TestBundle.ts`, `test/core/Relation.test.ts` and
`test/core/Relate.test.ts`.

## The idea

A relation is a named, reusable `include()`. It is defined once next to the
schema, is an expression you drop into any selection, and can be refined with
the same verbs as a select. There is no model, no registry, no `db.find` and
no query-config language: the query builder stays the only way to query.

The whole ORM is two functions, `many` and `one`, and one small class. Writes
add one method: `relation.of(row)` is a target for the existing `insert`,
`update` and `delete`.

## API

### Defining relations

A relation is a target table and the keys that tie it to its parent: an
object from target column to the parent field it equals. The fields say which
table the parent is. Composite keys are more entries.

```ts
import {eq, many, one} from 'rado'

const posts = many(Post, {authorId: User.id})
const author = one(User, {id: Post.authorId}).notNull()
const comments = many(Comment, {postId: Post.id})

const published = posts.where(eq(Post.published, true))

const items = many(OrderItem, {
  storeId: Order.storeId,
  orderNumber: Order.number
})
```

Both sides are checked. Keys are columns of the target, autocompleted, and
one that does not exist is an error. Values are fields of a table or of an
`alias()`, all of the same one, with a type that matches the column. The
errors name the reason: `'needs a table field'` for an expression or a field
of a subquery, view or common table expression, `'needs one parent'` for
fields of two tables, `'needs an alias'` for a field of the target itself,
`'no column x'` for an unknown key. The read condition is derived (`eq` per
pair).

Anything keys can't express is a condition instead. Such a relation reads
like any other, but has no `of`:

```ts
const recent = many(Post, eq(Post.authorId, User.id), gt(Post.year, 2020))
```

Relations are plain values. They can be exported loose, but the convention
is to put them on their table with `relate` (see "With their table").

`one` is typed `Row | null`. `.notNull()` drops the `null` for relations
backed by a not-null foreign key. It is a type-level statement only, like a
column's `.notNull()`.

### With their table

`relate(table, relations)` returns the table with its relations as
properties, so one import brings both:

```ts
// tables.ts
export const User = table('User', {id: id(), name: text().notNull()})
export const Post = table('Post', {id: id(), authorId: integer(), ...})

// schema.ts
import * as t from './tables.ts'

export const User = relate(t.User, {
  posts: many(t.Post, {authorId: t.User.id})
})
export const Post = relate(t.Post, {
  author: one(t.User, {id: t.Post.authorId}).notNull()
})

// app
import {Post, User} from './schema.ts'

db.select(User).from(User) // the columns
db.select(User, {posts: User.posts, total: User.posts.count()}).from(User)
db.select({title: Post.title, author: Post.author.select(User.name)})
  .from(Post)
await tx.insert(User.posts.of(user)).values({title: 'Hello'})
```

- The result is a table: same fields, same internal table, so `from`, joins,
  `insert`, `update`, `delete`, `create`, `drop`, `migrate`, `diff` and
  `alias` take it, and `t.User.name` and `User.name` are the same field.
- Selecting the table is selecting its columns: `select().from(User)`,
  `select(User)`, `select({user: User})`, a bare `returning()` and joins give
  the same rows as the plain table, at runtime and in the types. Relations
  are not part of rows, inserts or updates.
- `select(User, {total})` is the columns plus fields (see "Adding to a
  table"). It is what to write instead of `{...User, total}`.
- **A spread takes the relations along.** `{...User}` is every enumerable
  property, so `db.select({...User})` loads `posts` for every row, a
  correlated subquery per relation. The types say so (`posts: Array<Post>`
  is in the row), nothing warns. Don't spread a related table.
- Relations must hang under the table they are attached to:
  `relate(t.Post, {posts})` is a type error when `posts` has `User` as
  parent. Relations defined by a condition are not checked.
- A relation can't be named like a column, or like a relation the table
  already has: `relate(t.User, {name: ...})` is a type error at that key.
  No name is reserved.
- Tables stay free of relations, so table files import each other only for
  foreign keys, as before. The file that relates them imports all of them
  and nothing imports it back, so there is no cycle. One file works too:
  define the tables, then `relate` them below.
- `alias(User, 'Author')` is a plain table without relations. Use
  `User.posts.alias(Post, Author)`.
- Relating again adds: `relate(relate(t.User, a), b)` has both.
- A self relation is two related names, each with the way to the other:

  ```ts
  const up = alias(t.Node, 'Parent')
  const parent = one(up, {id: t.Node.parentId})
  export const Node = relate(t.Node, {parent})
  export const Parent = relate(up, {parent: parent.alias(t.Node, up)})

  db.select({
    name: Node.name,
    parent: Node.parent.select({
      name: Parent.name,
      parent: Parent.parent.select(Node.name)
    })
  }).from(Node)
  ```

- Many-to-many is the link relation and the far side, both on the post:

  ```ts
  const links = many(t.PostTag, {postId: t.Post.id})
  export const Post = relate(t.Post, {
    links,
    tags: links.many(t.Tag, {id: t.PostTag.tagId})
  })
  await tx.insert(Post.links.of(post)).values({tagId})
  ```

The examples below use loose names (`posts`, `author`) for brevity; read
them as `User.posts` and `Post.author`.

### Adding to a table

`select` takes a table and a second selection to add to its columns. This is
core rado, it does not need relations:

```ts
db.select(User, {total: count(Post.id)})
  .from(User)
  .leftJoin(Post, eq(Post.authorId, User.id))
  .groupBy(User.id)
// Array<{id: number, name: string, total: number}>

db.select(User, {posts: User.posts, stats: {total: User.posts.count()}}).from(
  User
)

User.posts.select(Post, {author: Post.author})
```

- The extras are any selection record: expressions, nested objects,
  `include()`, relations. The row is the table's row plus theirs, flat.
- A field named like a column replaces it, as in a spread:
  `select(User, {name: upper(User.name)})`.
- `from` is still written. `selectDistinct`, `selectDistinctOn` and a
  relation's `select` take the same pair.
- The first argument is a table. Extras on a subquery, view or CTE are a
  plain object, as before.

### Through another relation

A relation has a `many` of its own: from its rows, many of another table.
The target is joined to that relation's rows, and the result hangs under that
relation's parent. Many-to-many is the link table as a relation, and the far
side through it:

```ts
const links = many(PostTag, {postId: Post.id})
const tags = links.many(Tag, {id: PostTag.tagId})
```

`links` is an ordinary keyed relation, so it is also how tags are attached and
detached (see Writing). The same form reaches across any relation, and can be
stacked:

```ts
const replies = posts.many(Comment, {postId: Post.id}) // of a user
const used = posts
  .many(PostTag, {postId: Post.id})
  .many(Tag, {id: PostTag.tagId})
```

The key values are fields of the tables the relation already reads, any of
them; a field of another table is a type error. A filter on the relation
carries over; its selection, order and limit do not. The joined tables are in
scope, so `tags.select({name: Tag.name, at: PostTag.createdAt})` works. The
result is read-only: it has no `of` and no `alias`.

### Loading

Put the relation in a selection. Rows are fully typed, nothing to annotate.

```ts
const users = await db.select(User, {posts}).from(User)
// Array<{id: number, name: string, posts: Array<{id, authorId, title, ...}>}>

const post = await db.select({title: Post.title, author}).from(Post).get()
// {title: string, author: {id: number, name: string}} | null
```

### Refining and nesting

`select`, `where`, `orderBy`, `limit` and `offset` return a new relation.
`where` adds to the relation's own condition. Nesting is a relation inside a
relation's selection.

```ts
const users = await db
  .select({
    name: User.name,
    latest: posts
      .select({title: Post.title, author: author.select(User.name), tags})
      .where(eq(Post.published, true))
      .orderBy(desc(Post.createdAt))
      .limit(3)
  })
  .from(User)
// Array<{
//   name: string
//   latest: Array<{title: string, author: string, tags: Array<Tag>}>
// }>
```

Fields are the table's own fields (`Post.title`), not a per-relation copy.

### Filtering and counting

A relation is also a query, so the existing `exists` takes it. `every` is the
one shortcut, because it is the one that needs a double negation by hand.

```ts
// users with a draft
db.select()
  .from(User)
  .where(exists(posts.where(eq(Post.published, false))))

// users without posts
db.select()
  .from(User)
  .where(not(exists(posts)))

// every post published
db.select().from(User).where(posts.every(Post.published))

// counts
db.select({name: User.name, total: posts.count()}).from(User)
```

### First of many

`first()` turns a `many` into a single row or `null` and adds `limit 1`. It is
also how a has-one is written: the key lives on the target, as with `many`.

```ts
const latest = posts.orderBy(desc(Post.createdAt)).first()
const profile = many(Profile, {userId: User.id}).first()
```

### Writing

`relation.of(row)` is the target table narrowed to the rows that belong to one
parent row. Pass it to `insert`, `update` or `delete`:

```ts
await db.transaction(async tx => {
  const user = await tx.insert(User).values({name: 'Ben'}).returning().get()
  await tx.insert(posts.of(user)).values([{title: 'Hello'}, {title: 'World'}])
  await tx.update(posts.of(user)).set({published: true})
  await tx.delete(posts.of(user)).where(eq(Post.title, 'Hello'))
})
```

```sql
insert into "Post" ("id", "authorId", "title") values (default, ?, ?), ...
update "Post" set "published" = ? where "Post"."authorId" = ?
delete from "Post" where ("Post"."authorId" = ? and "Post"."title" = ?)
```

- On insert the key columns default to the parent's values, so they become
  optional in the values type. Passing one anyway wins, like any default.
- On update and delete the keys are and-ed with whatever `where` adds.
  `set({authorId: 2})` moves a row to another parent.
- The row is read by property, the name the field has on its table. With
  `uid: id('account_id')` and `many(Entry, {owner: Account.uid})` the scope
  is `entries.of({uid: 1})`, whatever the columns are called.
- `of` only needs the key columns, so `posts.of({id: 1})` is fine. That is
  the whole MySQL story: there is no `returning`, but the insert result has
  `insertId`.

  ```ts
  const {insertId} = await tx.insert(User).values({name: 'Ben'})
  await tx.insert(posts.of({id: insertId})).values({title: 'Hello'})
  ```

- It works the other way around too: `author.of(post)` is the user a post
  points at, `tx.update(author.of(post)).set({name: 'Ben'})`.
- Everything else is the builder you already have: `returning`, conflicts,
  `orderBy`/`limit`, batches, prepared queries. Each call is one statement.
- A missing key throws (`Missing id`) rather than widening a delete.
- Linking and unlinking a many-to-many is a write to the link relation:

  ```ts
  await tx.insert(links.of(post)).values(tagIds.map(tagId => ({tagId})))
  await tx.delete(links.of(post)).where(inArray(PostTag.tagId, tagIds))
  ```

### Aliases and self relations

`relation.alias(target, parent)` is the same relation between two other names
for its tables, in the order it was defined with. Keys, kind (`notNull`,
`first`) and `of` come along. It is how a relation is used under an aliased
parent:

```ts
const Author = alias(User, 'Author')
db.select({posts: posts.alias(Post, Author)}).from(Author)
```

A relation that points back at its own table needs a second name for that
table, as in SQL. Two names are enough for any depth: a level only ever
refers to itself and to the level above, so the names can alternate.

```ts
const Parent = alias(Node, 'Parent')
const parent = one(Parent, {id: Node.parentId})
const up = parent.alias(Node, Parent)

db.select({
  name: Node.name,
  parent: parent.select({
    name: Parent.name,
    parent: up.select({name: Node.name, parent: parent.select(Parent.name)})
  })
}).from(Node)
// {name: string, parent: {name: string, parent: {...} | null} | null}
```

The target must be an alias of the table the relation was defined with, and
the parent must have the key fields under the same names and types, which is
what an alias of the parent has. The types check both. Like `of`, `alias` exists on the relation as defined: a
refinement holds fields of the old names, and rewriting those is the magic
this design avoids. Alias first, then refine.

### What it compiles to

Exactly what `include()` already emits: one correlated subquery per relation
with JSON aggregation, in a single statement.

```sql
select (
  select jsonb_agg(jsonb_build_array(_."title"))
  from (
    select "Post"."title" from "Post" where "Post"."authorId" = "User"."id"
  ) as _
) as "posts" from "User"
```

`exists(posts)` and `posts.count()` are plain `exists (select ...)` and
`(select count(*) ...)` subqueries over the same `from` and `where`.

## Implementation

`Relation` extends `Include`, so SQL generation and row decoding are
inherited untouched. It holds the same `SelectQuery` data a `Select` holds;
each method spreads that data into a new instance. It also exposes the inner
select as `internalQuery`, which is what makes `exists(relation)` work. The
only change outside the new file is `exists` accepting any `HasQuery` instead
of `SingleQuery`.

Nothing happens at runtime beyond building query data: no proxies, no
callable objects, no alias rewriting, no schema walking, no changes to the
emitter, `Sql`, `Selection` or `Database`.

A keyed relation remembers its target and its key fields. `alias` builds the
condition again with the fields the new parent has under the same property
names; a relation's `many` adds the target as an inner join to its `from` and
keeps its `where`. `every` is
`not(exists(this.where(not(...))))`.

Writes are a scope: a copy of the target's `TableApi` where each key column
has a `$default` returning the parent's value, plus a `where`. Insert needed
no change at all, because it already asks columns for their defaults. Outside
`Relation.ts` the change is about ten lines:

- `TableApi` has an optional `where`; `updateQuery` and `deleteQuery` and it
  with their own.
- `insert`, `update` and `delete` on the builder accept `Table | Scope`.
  `Scope` is only the internal table a mutation reads. It has no target, so
  `select().from(posts.of(user))` is a type error instead of a silently
  unscoped read.

There is no planner, no dialect check and no extra query.

Bundle size (`bun run size`, minified `src/index.ts`):

|                        | bytes  | vs main | gzip vs main |
| ---------------------- | ------ | ------- | ------------ |
| main (1.3.0)           | 41,222 |         |              |
| orm3 (reads)           | 41,960 | +738    | +183         |
| orm3-writes            | 42,540 | +1,318  | +435         |
| orm3-gaps              | 42,799 | +1,577  | +543         |
| orm3-bundle            | 42,919 | +1,697  | +596         |
| orm3-flat              | 43,148 | +1,926  | +662         |
| field keys             | 43,306 | +2,069  | +689         |
| orm2 (vs its own base) | 50,971 | +11,643 |              |

The first six rows were measured when each step was made (main is 41,237
bytes today, the flat version 43,164). Field keys cost 142 bytes on top of
that (32 gzipped).

Writes cost 580 bytes on top of orm3 (252 gzipped). `alias`, relations as
parent and `every` cost 259 on top of that (108 gzipped), after giving back
the `innerJoin` method they replace. `relate` costs 120 (55 gzipped). Flat
relations and `select(table, extras)` cost 229 on top of that (59 gzipped).

`relate` is one statement: a new object with the property descriptors of the
table and of the relations, plus one hidden key holding the table's fields.
Copying descriptors instead of spreading leaves the `create` and `drop`
getters unread. `Table.ts` is untouched.

That hidden key is how a selection tells columns from relations.
`Selection` walks an object's entries; where it did so it now asks for the
object's fields first, which is the key's value when there is one and the
object itself otherwise. The key is not enumerable, so a spread of a related
table loses it and selects everything it copied, which is the behaviour the
types describe. Plain tables have no key and take the old path. Subquery
and CTE fields are built the same way, so `select(User).from(User).as('u')`
has the columns.

`select(table, extras)` is `{...fields, ...extras}` built from the table's
selection, shared by the builder and by `Relation.select`. Its type is the
table's fields with the extras laid over them, the type a spread of a plain
table has, so joins, nullability, subqueries and the parent check see
nothing new.

## Write design, and what changed from the proposal

The proposal was: key objects `many(Post, {authorId: User.id})`, a row-scoped
target `posts.of(user)`, and a nested `create` built on it.

**Key objects: first strings, now fields.** With `{authorId: User.id}` the
value is a `Field`, which knew its table name and its column name but not its
property key, neither at runtime nor in its type. `of(user)` has to read
`user.id`, so it needs the property key: with a renamed column
(`authorId: integer('author_id')`) the field only said `author_id`, and the
parameter of `of` could not be typed beyond `object`. The first version
worked around that by naming the parent and its columns as strings,
`many(Post, User, {authorId: 'id'})`. See "Field keys" for why and how that
was undone.

**`of(row)`: yes, as proposed.** It turned out smaller than expected because
"fill this column" is what `$default` already does. Two refinements:

- The filled key is optional rather than omitted. `Omit` would describe a
  table that has no `authorId`, which is wrong for `returning()` and forbids
  moving a row with `set({authorId})`. Optional is exactly what happens at
  runtime.
- `of` exists on the relation as defined (and after `notNull`/`first`), not
  after `where`, `select`, `orderBy` or `limit`. A filter can narrow an
  update but can't fill an insert, so `published.of(user)` would be half a
  scope. Write `tx.delete(posts.of(user)).where(...)` instead.

**Direction of `one`.** A key object says which columns are equal, not which
side holds the foreign key. For reads and for `of` that doesn't matter:
`author.of(post)` and `profile.of(user)` are both "the target rows matching
this parent row". It only matters for a nested create, which has to pick who
is inserted first. Inferring it (from primary keys or declared references)
breaks on shared-primary-key one-to-ones and on schemas without declared
references, so it should be stated by how the relation is built: `one` is
belongs-to (the parent holds the key, the target is inserted first), and a
has-one is `many(...).first()` (the target holds the key, the parent goes
first). No extra option, and the kind already in the type decides the order.

**Nested `create`: not built.** It does not stay small, for reasons that have
nothing to do with relations:

- Generated ids. `create` must read back the parent's key: `returning` on
  SQLite and Postgres, `insertId` on MySQL, which only covers a single
  auto-increment column. That is a dialect branch, and the returned row can't
  have one honest type across databases without a second query on MySQL.
- Sync drivers. rado runs synchronously on better-sqlite3, bun:sqlite and
  friends, where a transaction callback can't await. A `create` that awaits
  is unusable there; one that works on both needs `txGenerator`-style
  plumbing.
- Recursion needs a spec. `{posts}` covers one level; posts with comments
  needs a tree of relations next to the tree of data, which is the
  `with: {...}` config language this design avoided for reads.

This is orm2's planner in miniature. With `of`, the same thing in user code is
one line per level and uses whatever the database offers:

```ts
const user = await tx.insert(User).values({name: 'Ben'}).returning().get()
const [post] = await tx
  .insert(posts.of(user))
  .values([{title: 'Hello'}])
  .returning()
await tx.insert(comments.of(post)).values([{body: 'First'}])
```

Also still out: replacing children (`set`), insert-vs-update inference, and
`connect`/`disconnect` helpers. The link table of a many-to-many is a plain
relation, so `insert` and `delete` on `links.of(post)` are those helpers.

## Gaps closed

**Aliasing a relation.** The owner's idea was `parent.alias(Node, NodeAlias)`.
That shape is what was built, as `alias(target, parent)`. What was weighed:

- _Redefining_ (`one(Node, {id: Parent.parentId})`) already worked and is
  barely longer for one key. It repeats the keys, drops `notNull`/`first`,
  and nothing checks that the new tables are the same tables.
- _One argument that swaps a self relation's names_ (`parent.under(Parent)`
  selecting from `Node`). Shorter, but the reader has to know the rule to
  know which fields the nested selection uses.
- _Separate `from(parent)` and `as(target)`._ Two methods for one idea, and
  the self case needs both at once.
- _No alias in the definition_ (`one(Node, keys)` from `Node` with generated
  names). Fields are bound to a name when the table is made, so this needs
  the field rewriting orm2 had.

Two explicit tables in definition order won: nothing implicit, and the
selection that follows names the table that was just passed. The useful
finding is that a self relation never needs more than two names.

**Scoped delete on an alias.** `delete from` did not declare the alias, for
any aliased table, including `db.delete(alias(Node, 'N'))` on main. It now
emits `delete from "Node" as "Parent"`, which SQLite, Postgres and MySQL
(8.0.16 and up) accept.

**Writing through many-to-many.** Rather than a relation kind with link and
unlink verbs, the link table is a relation and the far side is defined
through it. One definition serves reads (`tags`) and writes (`links.of`).
`tags.of(post)` does not exist: it would read as writing tags while writing
links.

**`some` / `every` / `none`.** Only `every`. `exists(posts.where(...))` and
`not(exists(...))` read as well as `some` and `none` would, and are what the
rest of rado uses. `every` hides a double negation people get wrong. As in
Prisma, it holds for a parent without rows. A condition that is null for a
row does not count against it.

**Parent check.** A keyed relation carries its parent's name and the names
its own selection may use.

- Nested: `posts.select({posts})` is an error at the call, since a relation
  knows its own tables.
- In a query: `from` cannot be an error, because the parent may be joined
  afterwards (`.from(Post).innerJoin(User, ...)` is valid). `Select` already
  tracked the joined names for left-join nullability, so the row type is
  checked against those instead: a relation without its parent reads as the
  string type `'needs User in from'`, and any use of the field fails to
  compile with that message.
- Cost: one line in `Select` (the base of `SelectionFromTargets`) and one
  recursive type. Type instantiations for the whole repo including tests go
  from 835k to 1,040k (+24%); check time moved from 0.22s to 0.23s. No
  existing type test changed.
- Not checked: relations defined by a condition (their parent is not
  known), relations inside `exists(...)`, `count()` and `every()` (those are
  plain `Sql<boolean>` or `Sql<number>`), and queries whose `from` is not a
  named target.

## Field keys

Relations were first keyed by strings: `many(Post, User, {authorId: 'id'})`.
The strings were checked and autocompleted, but they were the one place in
rado where a column is not the `User.id` expression used everywhere else:
no go to definition, no rename, a parent named twice in a self relation
(`one(Parent, Node, ...)` next to `Node.parentId`), and a separate argument
whose only job was to give the strings a table. They are now fields:
`many(Post, {authorId: User.id})`.

**What a field was missing.** Its property name. `Field` now has it: the
runtime data has a `key`, set by `tableFields`, and the type has a third
parameter, `Field<Value, Table, Key>`, set by `TableFields` and defaulting to
`string`. Everything a relation needs follows from the key fields:

- the parent's name, for `relate` and the parent check, is the field's table;
- the read condition is `eq(target[key], field)`, the field itself;
- `of(row)` reads `row[key]` and is typed `{[Key]: Value}` per key field;
- `alias(target, parent)` takes `parent[key]`, and asks the parent for a
  field of that name and type.

**Where fields come from.** Only `tableFields` sets the key, so tables and
`alias()` have it. Fields of subqueries, common table expressions and views
built from a query are typed `Field<Value, Name>` without one, and are
rejected as key values with `'needs a table field'`. A view declared with
columns has keys at runtime, but its fields carry no table name in their
type, so it is rejected the same way; a view could not be a parent before
either. JSON columns are `JsonExpr`, not fields, and cannot be keys. At
runtime a field without a key still reads, and `of` and `alias` throw
`Not a table field`.

**Cost.** The third parameter alone adds 5,236 type instantiations to the
repo with its tests (1,107,054 to 1,112,290, +0.5%). With the new key types
and their tests it is 1,126,866 (+1.8%). Check time did not move (0.25s to
0.27s per run, before and after). No call site outside `Field.ts`,
`Table.ts` and `Relation.ts` changed, since the parameter has a default. A
brand only on table fields (`Field<V, T> & Keyed<K>`) was the lighter
alternative held in reserve; at this cost it was not needed, and an
intersection would have made every table field print worse in errors.

**Through relations.** The parent of `tags` is the `links` relation, and a
field cannot say which relation it came through. Two shapes were weighed:

- _A third argument_, `many(Tag, {id: PostTag.tagId}, links)`. One function,
  but the two-argument form gets a third overload, the route comes last
  although it is read first, and the unusual case shapes the common one.
- _A method_, `links.many(Tag, {id: PostTag.tagId})`. Chosen. It reads in
  the order the rows are reached, stacks without nesting
  (`posts.many(PostTag, ...).many(Tag, ...)`), and leaves `many(target,
keys)` with one meaning. The relation's type already lists the tables it
  reads, so the key values are checked against exactly those.

The target is now joined after the tables of the relation it goes through
(`from "PostTag" inner join "Tag"`), not before. That lets a key refer to
any table on the way, where the old order only allowed the nearest one.

**What got stricter.** A key that is not a column of the target is an error;
it used to pass. So is a field of the target's own table
(`one(Node, {id: Node.parentId})`), which compiled to a condition on one row.

**What got looser.** `alias` checks the parent by its key fields, not by its
whole definition: any table with those fields under those names is accepted.

## Bundling

The owner wants a table and its relations in one import. `relate` and the
two-file layout came out of the first round; the shape of the result took
two.

**First round: `User.rel.posts`, rejected.** Relations sat under one
reserved key, `rel`, declared as a class accessor and defined
non-enumerable. TypeScript leaves class accessors out of spread types, so
`{...User, total}` stayed the columns at runtime and in the types, which
mattered because that spread was how rado's docs selected "the columns plus
something". It worked, and the owner rejected it: `User.rel.posts` is a
level of ceremony on every use, a column named `rel` became impossible, and
the honest types rested on a TypeScript rule few people know.

**Second round: flat, and no spread.** The spread was the only thing
standing between the design and `User.posts`, so it was replaced rather than
protected. Relations are ordinary enumerable properties, the types are
`Table & Relations`, and "the columns plus something" is
`select(User, {total})`.

What that settles:

- Types and runtime agree everywhere, including the case that is left as a
  footgun. `{...User}` copies the relations, loads them, and its row type
  has them.
- No reserved name. A relation named like a column is a type error where it
  is written (`{[K in keyof Table]?: never}` over the relations).
- A related table is still the table: `select().from(User)`, `select(User)`,
  nested `{user: User}`, `returning()` and joins select columns. This needed
  the hidden fields key described under "Implementation", because all of
  them used to enumerate the table object.

**Shape of `select(table, extras)`.** Weighed:

- _Implied `from`_ (`db.select(User, {total})` as a complete query). Saves a
  word in the common case. But `select(User)` needs `from` today, the table
  selected is not always the table selected from (`select(Post, {...})
.from(User).innerJoin(Post, ...)`), and a query that sometimes has a
  `from` it never showed is the kind of implicit rado avoids. `from` stays.
- _A method after `from`_ (`db.select().from(User).extra({total})`). Reads
  well for one table, but after a join `select()` returns one object per
  table, so "add to the row" has no single meaning, and the row type would
  change late in the chain, after joins computed nullability.
- _A helper inside the object_ (`{...columns(User), total}`). No change to
  `select`, but it keeps the spread as the idiom, and the mistake
  (`{...User}`) is one word away from the right thing. This is what orm had.
- _Any number of selections, merged_ (`select(User, Post, {total})`). Two
  tables collide on `id` at once; nesting them is what `select()` with a
  join already does.
- _Extras nested under a key_ (`{...row, extras: {total}}`). Honest about
  what was added, but not what the spread gave and awkward for relations.

A table and one record won: it is the spread, as an argument. The row is
flat, an extra replaces a column of the same name, and the type is the one
the spread of a plain table has, so nothing downstream needed to learn about
it. Joins compose because nothing about `from` changed. Nested objects,
`include()` and relations are ordinary values in the record, and a relation
there goes through the parent check like any other.

It also fixes something the spread got wrong on main. A spread copies the
table's internal keys along with its columns, so
`select({...User, total}).from(User).leftJoin(Post, ...)` is treated as a
bare table selection and returns the joined table's columns as well. The
new form selects exactly the fields.

**What was checked.** A related table in `from`, joins, `insert`, `update`,
`delete`, `returning`, `create`, `drop`, `migrate`/`diff` (same statements
as the plain table), `alias`, as target and parent of `many`/`one`, and in
`relation.alias`. The parent check works unchanged through `User.posts`: it
only looks at the relation's type. `relate` adds a second check at
definition, that each relation's parent is the table.

**Alias.** `alias()` drops the relations, in the types as well, because it
returns `Table<Definition, Alias>` built from the columns. Re-rooting
automatically was weighed: it is clear for `posts` under an aliased `User`,
but not for a self relation (which name does the target get?), a through
relation or a condition, and it would make `Table.ts` know about relations.
`relation.alias` already says it in one call.

**Other shapes considered.**

- _`schema({User, Post}, t => ({User: {posts: ...}}))`_ returning every
  related table. One call, but one big inferred type, errors far from their
  cause, nothing saved (the parent is still named in `many`), and it cannot
  be split over files. `relate` per table composes and tree-shakes.
- _A separate namespace_ (`rel.User.posts`, or `user.posts` next to
  `User`). Two imports, which is what the owner wanted gone.
- _Flat but not enumerable._ The runtime spread would be the columns, but
  TypeScript's spread type keeps every property, so the row would be typed
  with a `posts` that is never there.
- _A relations class_ (`relate(t.User, class { get posts() {...} })`). Class
  getters are dropped from spreads, so this gives flat relations and a
  spread that is the columns. It is too odd an API, makes a new relation per
  access, and per-table files would still be circular in their types.
- _A namespace import per table file, relations in `table()`, `namespace`
  merging._ Cycles; thunks and circular types; not erasable syntax.
- _Mutating the table_ (`relate(User, {...})` adding relations in place). No
  second value for the table, but import order would decide whether
  `User.posts` exists.

## Compared with Drizzle and Prisma

|                     | Drizzle                 | Prisma                 | rado                                  |
| ------------------- | ----------------------- | ---------------------- | ------------------------------------- |
| Define              | `relations()` per table | schema file            | `many` / `one` values                 |
| Load                | `with: {posts: true}`   | `include` / `select`   | relation in the selection             |
| Refine              | options object          | options object         | `select`, `where`, `orderBy`, `limit` |
| Filter by relation  | `exists` by hand        | `some`/`every`/`none`  | `exists`, `not`, `every`              |
| Count               | `extras` with sql       | `_count`               | `count()`                             |
| Self relation       | `relationName`          | relation name          | `alias`, two names for any depth      |
| Many-to-many        | two hops, or `through`  | implicit or explicit   | `links.many(Tag, keys)`               |
| Link / unlink       | write the link table    | `connect`/`disconnect` | `insert`/`delete` on `links.of(row)`  |
| Scoped writes       | no                      | nested writes          | `of(row)`                             |
| Nested create       | no                      | yes                    | no, one line per level                |
| Replace children    | no                      | `set`                  | no                                    |
| Wrong parent        | not possible (`with`)   | not possible           | type error on use                     |
| Statements per read | one                     | one or several         | one                                   |

## What was taken from orm and orm2

- `one` / `many` as the two definition functions.
- Relations as values placed directly in a selection, rather than a
  `with: {posts: true}` config tree. This is what keeps inference trivial:
  the row type is just `SelectionRow` of the selection.
- orm's chained refinement (`User.posts.select(...).orderBy(...).limit(1)`)
  over orm2's options object.
- orm2's rule that relations compile through `include`, and its `required`
  flag (here `.notNull()`).
- Relation counts and filtering by relation, as features.

## What was rejected, and why

- **Spread models** (`{...users, posts: many(...)}`). Mixing relations into
  the table object meant `{...User}` no longer meant "the columns", which
  needed `columns()` in orm and `ModelSelection` plus "find selects physical
  columns only" in orm2. Relations are on the table again, but the spread is
  no longer the way to select it: the table itself is, see "Bundling".
- **`User.rel.posts`.** A reserved key that kept spreads honest. See
  "Bundling".
- **Relations inside `table()`** (orm). Touches `Table`, needs a `self`
  callback, and ties relation definitions to schema definition order.
- **Callable descriptors with rebound fields** (orm2's
  `UserModel.posts({select: {title: UserModel.posts.title}})`). This was the
  main source of mess: a `Callable` utility, a copy of the target's fields on
  every relation, generated aliases (`__relation_1`), recursive rebinding for
  nested relations, and `scopeTarget` rewriting inside `Sql` and the emitter.
  Using the table's own fields makes all of it unnecessary; SQL's lexical
  scoping already resolves `Post.authorId = User.id` to the nearest
  enclosing `User`.
- **`{from, to, through}` key mappings.** Parallel arrays need length
  validation and a separate `where` option. A single object from target
  column to parent column carries the same information, can't be mismatched,
  and the condition form remains for everything else.
- **`db.find` / `db.first` / `db.count` / `db.load`.** They duplicate
  `db.select()...`, `.get()` and `count()`, and put ORM code on `Database`
  where it can't be tree-shaken.
- **`some` / `none` / `is` / `isNot`.** `exists` and `not` cover them.
  `every` was added later, see "Gaps closed".
- **`innerJoin` on a relation.** It existed for many-to-many only, and left
  the link table defined inside a read-only relation. A relation as parent
  replaces it and can be written through.
- **`save` and the write planner.** orm's `save` infers insert vs update
  from the shape of the value; orm2 replaced it with an explicit planner that
  became most of its 1,086 lines and has dialect-specific phases (MySQL
  without `returning`, batch-only drivers without transactions). Nested
  writes are a different problem from relations and are out of scope here.

## Tradeoffs

- **A spread of a related table loads its relations.** `{...User}` is the
  columns and every relation, each a correlated subquery. The types tell the
  truth and nothing else stops it. `select(User, {...})` is the way to add
  fields; the docs no longer spread tables.
- **Relation names share a namespace with columns.** A clash is a type
  error in `relate`, also when a column is added later. On a table typed
  loosely (`Table<TableDefinition>`) every name clashes.
- **Two values per table.** `t.User` and `User` are different objects with
  the same fields. They are interchangeable in queries; only the related one
  has relations.
- **`select` has a second argument.** Only after a table, and only one
  record. Everything else about `select` is unchanged.
- **Extras are flat.** `select(User, {id: ...})` replaces the column without
  a word, as a spread did.
- **Aliases are explicit.** A self relation needs `alias()` for the table
  and `relation.alias()` for the way back. orm2 hid this at the cost of the
  rebinding machinery.
- **The parent check is soft at the top.** A misplaced relation is an error
  where its field is used, not where the query is written, and a function
  that returns the rows untyped lets it through. Relations defined by a
  condition, and relations inside `exists`, are not checked at all.
- **Three ways to define a relation.** Keys to a table's fields, `many` on a
  relation, or a condition. Only the first can be written through or
  aliased.
- **A field carries its property name.** One more type parameter on `Field`
  and one more value per field, for relations only. See "Field keys".
- **Key errors are strings.** A wrong key value fails with a message like
  `'needs a table field'`, reported under "No overload matches this call".
- **A scope is a snapshot of one row's keys.** It is built per call
  (a `TableApi` copy and a column copy per key). Cheap, but not free, and
  queries through it are not prepared once and reused across parents.
- **Delete on an alias needs MySQL 8.0.16.** Older versions reject
  `delete from t as a`.
- **Filled keys can be overridden.** They are defaults. `values({authorId})`
  through a scope inserts for another parent.
- **Refinement is a subset of `Select`.** Five methods are mirrored.
  Anything else (joins on a condition, group by, unions) is a hand-written
  `include()`.
- **`one` trusts you.** It does not add `limit 1`. If the condition matches
  several rows, SQLite returns the first and Postgres and MySQL raise.
- **`exists` selects columns it doesn't need.** Harmless for planners, but
  not the `select 1` a person would write.

## Open questions

1. Is a nested `create` worth its cost (see above)? If so it should be
   async-and-returning only at first, and say so in its types.
2. Should refinement be the real `Select` instead of mirrored methods? Making
   `Select` construct `this.constructor` would let `Relation` inherit joins,
   `groupBy` and the rest, at the cost of touching `Select` and its types.
3. Should a spread of a related table be made harder to write by accident?
   A lint rule could flag `{...User}` in a selection; the library can't
   without giving up honest types.
4. Should `select(target, extras)` also take a subquery, view or CTE as its
   first argument? The runtime would be the same line; the types need an
   overload per kind of target.
5. Should `returning` take `(table, extras)` too?
6. The parent check costs 24% more type instantiations and reports at the
   use of the field. Keep it, or drop the one line in `Select` and keep only
   the nested check, which is free and reports at the call?
7. Should `of` accept a refined relation and carry its filter into update
   and delete (ignoring it on insert)?
8. Recursive self relations (a whole tree) are a recursive CTE, not a
   relation. Leave to `withRecursive`?
9. Should `exists` take the parent name along (`Sql<boolean>` has nowhere to
   put it), so filters are checked too?
10. Should a relation have a `one` as well as a `many`?
    `relation.many(...).first()` covers it today.
