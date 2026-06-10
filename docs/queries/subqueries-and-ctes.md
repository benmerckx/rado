# Subqueries & CTEs

Queries compose: a select can be a value in a condition, a source in a
`from`, or a named building block in a `with` clause.

## Subqueries as values

A query that selects a single expression can be used directly inside
operators:

```ts
import {eq, inArray} from 'rado'

const activeUserIds = db.select(User.id).from(User).where(eq(User.active, true))

const posts = await db
  .select()
  .from(Post)
  .where(inArray(Post.authorId, activeUserIds))
```

Scalar subqueries work in selections too:

```ts
const users = await db
  .select({
    name: User.name,
    posts: db
      .select(count())
      .from(Post)
      .where(eq(Post.authorId, User.id))
      .$first() // marks the subquery as returning a single value
  })
  .from(User)
```

(For fetching related _rows_ rather than scalars, see
[Include](include.md).)

## Subqueries as sources with `.as()`

Name a query with `.as(alias)` and it becomes selectable and joinable —
its fields available as typed properties:

```ts
const postCounts = db
  .select({authorId: Post.authorId, total: count()})
  .from(Post)
  .groupBy(Post.authorId)
  .as('postCounts')

const rows = await db
  .select({name: User.name, total: postCounts.total})
  .from(User)
  .leftJoin(postCounts, eq(postCounts.authorId, User.id))
```

## Common table expressions

CTEs hoist a subquery to a named `with` clause. Define with `$with(name)`,
attach the query with `.as(...)`, then activate with `with(...)`:

```ts
const popular = db
  .$with('popular')
  .as(
    db
      .select({authorId: Post.authorId, total: count()})
      .from(Post)
      .groupBy(Post.authorId)
      .having(gt(count(), 5))
  )

const rows = await db
  .with(popular)
  .select({name: User.name, total: popular.total})
  .from(popular)
  .innerJoin(User, eq(User.id, popular.authorId))
```

Multiple CTEs go in one `with(cte1, cte2, ...)` call and can reference each
other.

### CTEs over inserts, updates and deletes

Data-modifying queries can be CTEs as well — useful for moving rows around in
one statement (PostgreSQL):

```ts
const removed = db
  .$with('removed')
  .as(db.delete(Post).where(eq(Post.published, false)).returning())

await db.with(removed).insert(PostArchive).select(db.select().from(removed))
```

## Recursive CTEs

Use `withRecursive` and give the CTE a `unionAll` whose second part references
itself through the callback argument:

```ts
import {lte, sql} from 'rado'

const fibonacci = db.$with('fibonacci').as(
  db.select({n: sql<number>`1`, next: sql<number>`1`}).unionAll(self =>
    db
      .select({n: self.next, next: sql<number>`${self.n} + ${self.next}`})
      .from(self)
      .where(lte(self.next, 13))
  )
)

const numbers = await db
  .withRecursive(fibonacci)
  .select(fibonacci.n)
  .from(fibonacci)
// [1, 1, 2, 3, 5, 8, 13]
```

The classic use case — walking a tree of categories or an org chart — looks
the same: anchor query, `unionAll`, recursive part joining `self`.
