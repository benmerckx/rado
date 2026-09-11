# ORM helpers

Rado's ORM layer adds reusable relation definitions and an explicit write
planner to the regular query API. Relations are loaded only when selected, and
write operations never infer insert or update from the shape of a value.

## Define a model

Spread a table and add `one` or `many` relations. The `from` and `to`
fields define the values copied or compared between both sides:

```ts
import {many, one} from 'rado'

const UserModel = {
  ...User,
  posts: many(Post, {from: User.id, to: Post.authorId})
}

const PostModel = {
  ...Post,
  author: one(User, {
    from: Post.authorId,
    to: User.id,
    required: true
  })
}
```

For composite relations, pass equally sized arrays. Fields at the same index
form one key pair:

```ts
const OrderItemModel = {
  ...OrderItem,
  order: one(Order, {
    from: [OrderItem.storeId, OrderItem.orderNumber],
    to: [Order.storeId, Order.orderNumber],
    required: true
  })
}
```

A definition-level `where` scopes every load, predicate, and operation that
selects existing related rows. It does not rewrite values supplied to a
relation insert:

```ts
const UserModel = {
  ...User,
  publishedPosts: many(Post, {
    from: User.id,
    to: Post.authorId,
    where: eq(Post.published, true)
  })
}
```

## Select relations

`db.find(UserModel)` and `db.first(UserModel)` select physical columns only.
Invoke a relation to include it. Relation descriptors expose their target
fields, so selections and conditions do not need callbacks:

```ts
const users = await db.find(UserModel, {
  select: {
    ...UserModel,
    posts: UserModel.posts({
      select: {title: UserModel.posts.title},
      where: eq(UserModel.posts.published, true),
      orderBy: [UserModel.posts.title],
      limit: 5
    })
  }
})
```

The fields on a relation are scoped to that relation's SQL alias. Use
`UserModel.posts.title` inside its query rather than the original
`Post.title`. If a relation targets another model, its nested relations are
available in the same way:

```ts
UserGraph.posts({
  select: {
    title: UserGraph.posts.title,
    author: UserGraph.posts.author({
      select: {name: UserGraph.posts.author.name}
    })
  }
})
```

Relation queries are ordinary correlated selects compiled through `include`.
They accept the usual selection, filtering, ordering, grouping, and join
options:

```ts
UserModel.posts({
  select: {title: UserModel.posts.title, body: Comment.body},
  joins: [
    {
      innerJoin: Comment,
      on: eq(Comment.postId, UserModel.posts.id)
    }
  ]
})
```

## Many-to-many relations

Add `through` when two models are connected by a join table:

```ts
const PostTag = table(
  'post_tag',
  {
    postId: integer()
      .notNull()
      .references(() => Post.id),
    tagId: integer()
      .notNull()
      .references(() => Tag.id)
  },
  self => [primaryKey(self.postId, self.tagId)]
)

const PostModel = {
  ...Post,
  tags: many(Tag, {
    from: Post.id,
    to: Tag.id,
    through: {
      table: PostTag,
      from: PostTag.postId,
      to: PostTag.tagId
    }
  })
}
```

`from` and `through.from` must have the same number of fields, as must
`to` and `through.to`. Composite keys use the same index-based pairing as
direct relations.

## Find, first, and count

```ts
const all = await db.find(UserModel, {where: eq(User.active, true)})
const first = await db.first(UserModel, {where: eq(User.id, 1)})
const total = await db.count(UserModel, {where: eq(User.active, true)})
```

`first` returns `null` when no row matches. `count` returns a number.

## Filter by relations

Use the standalone `some`, `none`, and `every` predicates with `many`
relations, and `is` or `isNot` with `one` relations:

```ts
const authors = await db.find(UserModel, {
  where: some(UserModel.posts, eq(UserModel.posts.published, true))
})

const postsWithoutArchivedTags = await db.find(PostModel, {
  where: none(PostModel.tags, eq(PostModel.tags.name, 'archived'))
})
```

Omitting the condition checks relation existence for `some` and `is`, and
absence for `none` and `isNot`. `every` follows vacuous truth and therefore
also matches rows with no related records; without a condition it matches
every root. The predicate can instead receive `{where, joins}` when joins
are needed.

## Build a write plan

`db.write(Model)` starts a plan for that model. Establish its rows with a
root `insert` or `where`, then append explicit operations:

```ts
const [ada] = await db
  .write(UserModel)
  .insert({name: 'Ada'})
  .insert(UserModel.posts, [{title: 'Hello'}, {title: 'World'}])
  .returning({
    id: UserModel.id,
    name: UserModel.name
  })
```

`returning()` returns the native result of the final model's root insert,
update, or delete. It is written at the end of the JavaScript chain, but it is
attached to that root mutation rather than querying the completed plan again.
Operations appended after the root mutation therefore do not appear in its
result. Use terminal `select` when the final relation state is needed:

```ts
const [post] = await db
  .write(PostModel)
  .insert({title: 'Hello'})
  .insert(PostModel.author, {name: 'Ada'})
  .insert(PostModel.tags, {name: 'SQL'})
  .select({
    title: PostModel.title,
    author: PostModel.author(),
    tags: PostModel.tags()
  })
```

`select(selection)` combines captured root values with relations loaded after
the writes. It does not look up the root again by a primary key: the captured
values supply the root of the final query. It supports keyless tables, preserves
duplicate root rows, and returns an array. Root values are the mutation snapshot;
later trigger changes to the root are not reloaded. A `where`-only segment can
also use `select`, in which case its captured values come from the scoped read.
The initial implementation executes one final selection per captured root.

Like the regular query builder, write-plan returning is available on
PostgreSQL and SQLite but not MySQL. Final graph selection has the same dialect
restriction. Returning always returns an array because an
insert or update can affect multiple rows. No primary key is needed for
returning.

MySQL also cannot return generated relation fields while executing a plan.
When a later relation operation needs a field from an inserted row, provide
that mapped field explicitly in the insert value, or define a client-side
`$default(() => value)` on its column. Client defaults needed by a relation are
evaluated once and the same value is used for both writes. SQL expressions and
unknown database-generated relation values are rejected. The planner does not
infer values from `insertId`.

For existing MySQL rows, the planner captures required relation values before
the root mutation, using a locking read when transactions are supported. Literal
changes to those values are supported; SQL-computed changes and implicit
`$onUpdate` changes to required relation values are rejected.

Use `where` to modify existing rows and their relations:

```ts
const updated = await db
  .write(PostModel)
  .where(eq(PostModel.id, postId))
  .update({title: 'Updated'})
  .insert(PostModel.comments, {body: 'New'})
  .update(PostModel.comments, eq(PostModel.comments.id, commentId), {
    body: 'Edited'
  })
  .delete(PostModel.comments, eq(PostModel.comments.id, obsoleteId))
  .connect(PostModel.tags, eq(PostModel.tags.slug, 'typescript'))
  .disconnect(PostModel.tags, eq(PostModel.tags.id, oldTagId))
  .returning({id: PostModel.id, title: PostModel.title})
```

The operations have distinct meanings:

- `insert(relation, values)` creates related target rows and wires their
  relation keys.
- `update(relation, where, values)` changes matching related target rows.
- `delete(relation, where)` deletes matching target rows.
- `connect(relation, where)` keeps target rows and creates or updates the
  association.
- `disconnect(relation, where)` removes the association without deleting
  target rows.

For a direct `many`, inserts copy the parent `from` values to each target
`to` field. For a `one`, the target is resolved first and its `to`
values are copied to the parent. Through relations write or remove join rows.
When a plan covers multiple parents, direct-many inserts create children for
each parent; through inserts create the target rows once and link them to
every parent.
These mappings come entirely from the relation definition; primary keys are
not inspected to decide which operation to perform. Field mappings are validated
and recorded when the relation is defined, including mappings between JavaScript
property keys and explicit SQL column names. Each paired field list must be
nonempty and have the same length; through relations validate both sides of the
join table.

### Write phases

A segment is a dependency plan with these phases:

1. Resolve `one`-relation inserts and connects that supply root foreign keys.
2. Execute one root insert or update, including root-owned foreign-key changes.
3. Execute dependent writes: target updates, child writes, and join-table writes.
4. If requested, select the completed graph.

Put the root `update` first, followed by root-owned `one` inserts, connects,
disconnects, or deletes, then dependent operations. The builder types reject
root changes after dependent writes. Root-owned foreign-key assignments are
combined with the root update, so changing a field used in `where` does not
prevent a subsequent author connection. Internal returning captures computed
relation values whether or not public `returning()` is called.
Root-only mutations do not load rows first or request internal returning.
Internal row capture is added only when later operations or final graph
selection need those values.

Each root-owned relation field can be assigned only once per segment. Supply
it either in the root values or through a relation operation. Conditional
disconnects clear only matching associations; deleting an optional `one` target
clears the association in the root phase and deletes the target afterward.
Updating a `one` target is a dependent write and sees the newly established
association.

Use another `write(Model)` segment when an operation must depend on the results
of an earlier phase. Root deletion occupies its own segment; delete dependents
in an earlier segment when needed by foreign-key constraints. Empty scopes and
empty root inserts perform no related writes.

A relation update, delete, or disconnect is constrained by both the root
scope and its own predicate. A direct-many `connect` requires the root scope
to resolve to one parent because assigning the same target to several parents
would be ambiguous. A one-relation `connect` likewise requires exactly one
matching target.

Call `write` again to include an unrelated model in the same plan:

```ts
await db
  .write(PostModel)
  .where(eq(PostModel.id, postId))
  .update({title: 'Published'})
  .write(AuditLog)
  .insert({action: 'post.published', postId})
```

`returning` applies to the final model in a multi-model plan. The whole plan
runs in one interactive transaction when the driver supports transactions.
On batch-only drivers, operations execute sequentially and an error may leave
earlier writes committed.

Write plans are immutable: extending a plan does not change the original or
other branches. Each step shares its preceding instructions; execution walks
them in call order and resolves the dependency phases within each segment.

## Self-relations

Self-relations use the same field API. Select outer fields at the root and
related fields inside the relation:

```ts
const NodeModel = {
  ...Node,
  parent: one(Node, {from: Node.parentId, to: Node.id})
}

const nodes = await db.find(NodeModel, {
  select: {
    childId: NodeModel.id,
    childName: NodeModel.name,
    parent: NodeModel.parent({
      select: {
        id: NodeModel.parent.id,
        name: NodeModel.parent.name
      }
    })
  }
})
```

Aliases are generated and scoped automatically. Set `alias` in a relation
definition only when readable generated SQL or stable SQL snapshots matter.
