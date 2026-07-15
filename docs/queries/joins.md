# Joins

Combine tables with the usual join family, plus lateral variants for the
databases that support them.

```ts
import {eq} from 'rado'

const rows = await db
  .select({title: Post.title, author: User.name})
  .from(Post)
  .innerJoin(User, eq(Post.authorId, User.id))
```

## Available joins

```ts
db.select().from(A).innerJoin(B, on) // rows with a match in both
db.select().from(A).leftJoin(B, on) // all of A, B nullable
db.select().from(A).rightJoin(B, on) // all of B, A nullable
db.select().from(A).fullJoin(B, on) // all of both, either side nullable
db.select().from(A).crossJoin(B) // cartesian product, no condition
```

The join condition is any boolean expression, typically `eq` between two
columns, but anything from [Filter operators](operators.md) works, including
`and`-ed combinations.

## Nullability is tracked

Result types reflect the join semantics. After a `leftJoin`, the joined
table's columns are nullable; after `fullJoin`, both sides are:

```ts
const rows = await db
  .select()
  .from(User)
  .leftJoin(Post, eq(Post.authorId, User.id))
// Array<{user: User, post: Post | null}>. Post is null when unmatched
```

With the default `select()`, joined results are grouped per table. Select
explicit columns to flatten:

```ts
const flat = await db
  .select({name: User.name, title: Post.title})
  .from(User)
  .leftJoin(Post, eq(Post.authorId, User.id))
// Array<{name: string, title: string | null}>
```

## Self-joins with `alias`

Joining a table to itself needs an alias to disambiguate:

```ts
import {alias, eq} from 'rado'

const Manager = alias(User, 'manager')

const rows = await db
  .select({employee: User.name, manager: Manager.name})
  .from(User)
  .leftJoin(Manager, eq(User.managerId, Manager.id))
```

## Joining subqueries

Subqueries become joinable (and selectable) once they have a name via
`.as()`:

```ts
const postCounts = db
  .select({authorId: Post.authorId, posts: count()})
  .from(Post)
  .groupBy(Post.authorId)
  .as('postCounts')

const rows = await db
  .select({name: User.name, posts: postCounts.posts})
  .from(User)
  .leftJoin(postCounts, eq(postCounts.authorId, User.id))
```

More in [Subqueries & CTEs](subqueries-and-ctes.md).

## Lateral joins (PostgreSQL/MySQL)

A lateral join lets the joined subquery reference columns from earlier tables.
Think "for each row, run this subquery":

```ts
const latestPost = db
  .select()
  .from(Post)
  .where(eq(Post.authorId, User.id))
  .orderBy(desc(Post.createdAt))
  .limit(1)
  .as('latestPost')

const rows = await db
  .select({name: User.name, latest: latestPost.title})
  .from(User)
  .leftJoinLateral(latestPost, sql`true`)
```

Available variants: `leftJoinLateral`, `innerJoinLateral`,
`crossJoinLateral`.

> Tip: if you're reaching for a lateral join to fetch related rows, also look
> at [Include](include.md). It expresses "fetch these related rows per
> result" directly and works on every dialect.
