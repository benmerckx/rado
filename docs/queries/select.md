# Select

Everything about reading data: shaping the selection, filtering, ordering,
grouping, pagination and a few power tools.

```ts
import {eq} from 'rado'

const users = await db.select().from(User).where(eq(User.name, 'Ada'))
```

## What to select

### Everything

```ts
const users = await db.select().from(User)
// Array<{id: number, name: string, email: string | null}>
```

With joins involved, `select()` returns the columns of all joined tables (see
[Joins](joins.md) for how they're combined).

### An object of columns and expressions

```ts
const rows = await db
  .select({
    id: User.id,
    name: User.name,
    nameLength: sql<number>`length(${User.name})`
  })
  .from(User)
// Array<{id: number, name: string, nameLength: number}>
```

Selections can be nested — the result mirrors the shape:

```ts
const rows = await db
  .select({
    id: User.id,
    contact: {name: User.name, email: User.email}
  })
  .from(User)
// Array<{id: number, contact: {name: string, email: string | null}}>
```

Spreading a table works too, handy for "everything plus":

```ts
const rows = await db
  .select({...User, postCount: count(Post.id)})
  .from(User)
  .leftJoin(Post, eq(Post.authorId, User.id))
  .groupBy(User.id)
```

### A single expression

Select a bare field or expression and you get an array of values instead of
objects — a small thing you'll end up using constantly:

```ts
const names = await db.select(User.name).from(User)
// Array<string>

const [total] = await db.select(count()).from(User)
// number
```

### Renaming with `.as()`

Any expression can be aliased:

```ts
const rows = await db
  .select({upper: sql<string>`upper(${User.name})`.as('upper_name')})
  .from(User)
```

## Filtering with `where`

`where` accepts one or more conditions — multiple arguments are combined with
`and`:

```ts
import {and, eq, gt, isNull, or} from 'rado'

await db.select().from(User).where(eq(User.name, 'Ada'))

// These two are equivalent:
await db.select().from(User).where(gt(User.id, 10), isNull(User.email))
await db
  .select()
  .from(User)
  .where(and(gt(User.id, 10), isNull(User.email)))

// Compose freely
await db
  .select()
  .from(User)
  .where(or(eq(User.name, 'Ada'), and(gt(User.id, 10), isNull(User.email))))
```

The full operator catalog lives in [Filter operators](operators.md).

Conditions passed as `undefined` are ignored, which makes optional filters
pleasant:

```ts
function findUsers(filters: {name?: string; minId?: number}) {
  return db
    .select()
    .from(User)
    .where(
      filters.name ? eq(User.name, filters.name) : undefined,
      filters.minId ? gt(User.id, filters.minId) : undefined
    )
}
```

## Ordering

```ts
import {asc, desc} from 'rado'

await db.select().from(User).orderBy(asc(User.name))
await db.select().from(Post).orderBy(desc(Post.createdAt), asc(Post.title))
```

## Grouping and `having`

```ts
import {count, gt} from 'rado'

const prolific = await db
  .select({authorId: Post.authorId, posts: count()})
  .from(Post)
  .groupBy(Post.authorId)
  .having(gt(count(), 5))
```

More aggregate functions in [Aggregates](aggregates.md).

## Pagination

```ts
const pageSize = 10
const page = 3

await db
  .select()
  .from(Post)
  .orderBy(desc(Post.createdAt))
  .limit(pageSize)
  .offset((page - 1) * pageSize)
```

## Distinct

```ts
// Distinct rows
await db.selectDistinct({name: User.name}).from(User)

// PostgreSQL: distinct on specific columns
await db
  .selectDistinctOn([Post.authorId], {
    authorId: Post.authorId,
    title: Post.title
  })
  .from(Post)
  .orderBy(Post.authorId, desc(Post.createdAt))
```

## Getting one row (or one value)

Queries are thenable and iterate to an array by default. Two execution
helpers change that:

```ts
const all = await db.select().from(User) // Array<Row>
const allToo = await db.select().from(User).all() // same
const first = await db.select().from(User).get() // Row | undefined
```

On synchronous drivers (better-sqlite3, `bun:sqlite`, sql.js) both `.all()`
and `.get()` return results directly without awaiting.

## Counting rows

`db.$count` is a shortcut for the count-with-optional-filter dance:

```ts
const total = await db.$count(User)
const filtered = await db.$count(User, gt(User.id, 10))
```

## Row locking (PostgreSQL/MySQL)

```ts
await db.select().from(User).where(eq(User.id, 1)).for('update') // select ... for update

await db.select().from(User).for('share', {of: User, skipLocked: true})
```

## Immutability: build once, branch freely

Every method returns a _new_ query. A base query can safely fan out:

```ts
const posts = db.select().from(Post)

const drafts = posts.where(eq(Post.published, false))
const recent = posts.orderBy(desc(Post.createdAt)).limit(5)

// `posts` is still unfiltered; all three are independent queries
```

This also means partial queries are perfectly good values to pass around,
store in constants or export from modules.

## Dynamic query building

Because of immutability, conditional chaining requires reassignment. Annotate
the query with `$dynamic()` to keep the types happy while reassigning:

```ts
let query = db.select().from(Post).$dynamic()
if (onlyPublished) query = query.where(eq(Post.published, true))
if (sorted) query = query.orderBy(desc(Post.createdAt))
const results = await query
```

## Inspecting the SQL

Curious what a query compiles to? Every query exposes `toSQL`:

```ts
const {sql, params} = db.select().from(User).where(eq(User.id, 1)).toSQL()
// sql: 'select "user"."id", ... from "user" where "user"."id" = $1'
```

See [Prepared statements](../runtime/prepared-statements.md) for more.
