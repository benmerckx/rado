# Thin ORM helpers

Rado's ORM helpers are a small convenience layer over the regular select and
include APIs. They add reusable relationship definitions without introducing
a separate query builder, result hydration pass, or automatic relation loading.

## Define a model

Spread a table and add `one` or `many` relations. A relation is defined by the
two fields that should be equal:

```ts
import {many, one} from 'rado'

const UserModel = {
  ...User,
  posts: many(Post, {from: User.id, to: Post.authorId})
}

const PostModel = {
  ...Post,
  author: one(User, {from: Post.authorId, to: User.id})
}
```

`db.find(UserModel)` and `db.first(UserModel)` select physical columns only.
Relations run only when their functions appear in an explicit selection:

```ts
const users = await db.find(UserModel, {
  select: {
    ...columns(UserModel),
    posts: UserModel.posts({
      select: {title: Post.title},
      where: eq(Post.published, true),
      orderBy: [Post.title],
      limit: 5
    })
  }
})
```

The relation query is an ordinary correlated select compiled through
`include`, so it stays in the same SQL statement. Selection, filtering,
ordering, grouping, joins, and interpolated field expressions continue to use
the normal rado query representation.

## Many-to-many relations

Add `through` to a `many` relation when its endpoints are connected by a join
table. The outer `from` and `to` fields identify the endpoint keys; the fields
inside `through` identify the corresponding keys on the join table:

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

Loading the relation produces one correlated query with an inner join through
`PostTag`. Relation selections and filters still refer to `Tag` normally.

Joins use the existing declarative join objects without replacing the fixed
relation target:

```ts
UserModel.posts({
  select: {title: Post.title, body: Comment.body},
  joins: [
    {
      innerJoin: Comment,
      on: eq(Comment.postId, Post.id)
    }
  ]
})
```

## Find, first, and count

```ts
const all = await db.find(UserModel, {where: eq(User.active, true)})
const first = await db.first(UserModel, {where: eq(User.id, 1)})
const total = await db.count(UserModel, {where: eq(User.active, true)})
```

`first` returns `null` when no row matches. `count` returns a scalar number.

## Filter by relations

Relation descriptors expose correlated predicates that can be used anywhere a
normal SQL condition is accepted. `many` relations provide `some`, `none`, and
`every`; `one` relations provide `is` and `isNot`:

```ts
const authors = await db.find(UserModel, {
  where: UserModel.posts.some({
    where: eq(Post.published, true)
  })
})

const postsWithoutArchivedTags = await db.find(PostModel, {
  where: PostModel.tags.none({
    where: eq(Tag.name, 'archived')
  })
})
```

Calling `some()` or `is()` without a query checks whether the relation exists.
`none()` and `isNot()` negate that check. `every()` follows the usual vacuous
truth rule: it also matches rows with no related records. Predicate queries
accept `where` and `joins`, and many-to-many predicates automatically use the
configured through table.

## Save one or many rows

`save` accepts either one physical row or an array and returns the same
cardinality. A supplied primary key updates the matching row, or inserts it
when it does not exist. A missing primary key inserts a new row:

```ts
const ada = await db.save(UserModel, {name: 'Ada'})
const users = await db.save(UserModel, [{name: 'Grace'}, {name: 'Lin'}])
const updated = await db.save(UserModel, {
  id: ada.id,
  email: 'ada@example.com'
})
```

Array saves preserve input order and run in a transaction when the driver
supports interactive transactions. On batch-only drivers such as Cloudflare
D1, `save` executes the same dependency-ordered operations sequentially. A
failure can therefore leave earlier writes committed. `save` only handles the
relation values that are supplied. A `one` relation is saved before its parent
so its key can be copied to the parent's foreign key. A `many` relation is
saved after its parent so the parent key can be copied to every child:

```ts
const post = await db.save(PostModel, {
  title: 'Hello',
  author: {name: 'Ada'},
  comments: [{body: 'Nice'}, {body: 'Thanks'}]
})
```

Relations omitted from the value are left untouched. A supplied `many` array
upserts those children but does not delete rows omitted from the array. Nested
graph saves work when a relation targets another spread model; a relation that
targets a bare table saves only that table's physical fields.

For a many-to-many relation, `save` first saves each target and then upserts its
join row. A composite primary key over the two join fields makes repeated saves
idempotent. As with direct `many` relations, omitted associations are not
deleted.

Save plans are built lazily once per model object, including physical columns,
primary keys, relation metadata, and foreign-key property mappings. Rado does
not maintain an identity map. Use the regular mutation builders when explicit
conflict targets, deletion synchronization, or single-statement bulk SQL are
required.

## Self-relations

Relation targets are aliased automatically. For a self-relation, pass a
callback when the selection needs fields from both the outer row and the
related row. Normal table fields refer to the related row; the callback value
refers to the outer row:

```ts
const NodeModel = {
  ...Node,
  parent: one(Node, {from: Node.parentId, to: Node.id})
}

const nodes = await db.find(NodeModel, {
  select: {
    relation: NodeModel.parent(child => ({
      select: {
        parentId: Node.id,
        childId: child.id
      }
    }))
  }
})
```

Aliases are scoped, so nested relations and nested self-relations resolve
against their immediate parent. Pass `{alias: 'parent'}` in the relation
definition only when readable generated SQL or stable SQL snapshots matter.

For synchronization that deletes omitted relations, join tables with additional
required data, or other advanced cases, use the underlying `select`, `join`,
and `include` APIs directly.
