# Include

`include` fetches related rows as part of a select. It returns nested arrays or objects,
fully typed, declared inline. It's rado's answer to "I want the user and
their posts" without a separate ORM API, a relations file or N+1 queries.

```ts
import {eq, include} from 'rado'

const users = await db
  .select({
    ...User,
    posts: include(db.select().from(Post).where(eq(Post.authorId, User.id)))
  })
  .from(User)

// Array<{id: number, name: string, ..., posts: Array<Post>}>
```

The inner select references the outer table (`User.id`) directly. That's the
relationship, declared exactly where it's used. Everything runs as a single
query using JSON aggregation under the hood.

## `include.one` for single rows

When the relation is to-one (or you only want the first match), `include.one`
returns an object instead of an array. `null` when there's no match:

```ts
const posts = await db
  .select({
    ...Post,
    author: include.one(
      db.select().from(User).where(eq(User.id, Post.authorId))
    )
  })
  .from(Post)

// Array<{..., author: User | null}>
```

## Shaping the included selection

The inner query is a regular select. Filter it, sort it, limit it and shape it:

```ts
const users = await db
  .select({
    id: User.id,
    name: User.name,
    latestPosts: include(
      db
        .select({id: Post.id, title: Post.title})
        .from(Post)
        .where(eq(Post.authorId, User.id), eq(Post.published, true))
        .orderBy(desc(Post.createdAt))
        .limit(3)
    )
  })
  .from(User)
```

## Nesting includes

Includes nest. Each level is still part of the same single query:

```ts
const users = await db
  .select({
    ...User,
    posts: include(
      db
        .select({
          ...Post,
          comments: include(
            db.select().from(Comment).where(eq(Comment.postId, Post.id))
          )
        })
        .from(Post)
        .where(eq(Post.authorId, User.id))
    )
  })
  .from(User)
```

## Selecting a bare include

An include is an expression like any other. It can even be the whole
selection:

```ts
const allTitlesPerUser = await db
  .select(
    include(db.select(Post.title).from(Post).where(eq(Post.authorId, User.id)))
  )
  .from(User)
// Array<Array<string>>
```

## How it works

Rado compiles the inner query to a JSON aggregation
(`json_group_array`/`jsonb_agg`/`json_arrayagg` depending on dialect) embedded
as a correlated subquery. The database does the joining and nesting; rado
types and parses the result. One round-trip, no result-stitching in
JavaScript.
