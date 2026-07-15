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

## Find, first, and count

```ts
const all = await db.find(UserModel, {where: eq(User.active, true)})
const first = await db.first(UserModel, {where: eq(User.id, 1)})
const total = await db.count(UserModel, {where: eq(User.active, true)})
```

`first` returns `null` when no row matches. `count` returns a scalar number.

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

For many-to-many relationships, graph writes, relation predicates such as
`some`, or other advanced cases, use the underlying `select`, `join`, and
`include` APIs directly.
