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

Omitting the condition checks relation existence. `every` follows vacuous
truth and therefore also matches rows with no related records. The predicate
can instead receive `{where, joins}` when joins are needed.

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
result. Use `find` when the final relation state is needed.

Like the regular query builder, write-plan returning is available on
PostgreSQL and SQLite but not MySQL. It always returns an array because an
insert or update can affect multiple rows. No primary key is needed for
returning.

MySQL also cannot return generated relation fields while executing a plan.
When a later relation operation needs a field from an inserted row, provide
that mapped field explicitly in the insert value. The planner does not infer
it from `insertId`.

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
These mappings come entirely from the relation definition; primary keys are
not inspected to decide which operation to perform.

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
