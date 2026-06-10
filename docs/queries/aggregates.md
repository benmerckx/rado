# Aggregates

Aggregate functions are exported from `rado` and combine with `groupBy` and
`having` for summarizing data.

```ts
import {avg, count, countDistinct, max, min, sum} from 'rado'
```

## `count`

```ts
// All rows
const [total] = await db.select(count()).from(User)

// Non-null values of a column
const [withEmail] = await db.select(count(User.email)).from(User)

// Distinct values
const [authors] = await db.select(countDistinct(Post.authorId)).from(Post)
```

`count` returns a `number`. For the common "count with a filter" case there's
also the shortcut `db.$count(Table, condition?)`.

## `sum` and `avg`

```ts
const [totalViews] = await db.select(sum(Post.views)).from(Post)
const [avgViews] = await db.select(avg(Post.views)).from(Post)
```

Note the return type: `string | null`. Sums and averages can exceed the safe
integer range or carry precision, so the database's exact answer is returned
as a string — convert explicitly when you know it's safe, or use `mapWith`:

```ts
const [avgViews] = await db
  .select(avg(Post.views).mapWith(Number))
  .from(Post)
// number | null
```

`sumDistinct` and `avgDistinct` aggregate distinct values only.

## `min` and `max`

```ts
const [newest] = await db.select(max(Post.createdAt)).from(Post)
const [first] = await db.select(min(User.id)).from(User)
```

These preserve the column's type (`Sql<T>`).

## Grouping

```ts
const perAuthor = await db
  .select({
    authorId: Post.authorId,
    posts: count(),
    totalViews: sum(Post.views)
  })
  .from(Post)
  .groupBy(Post.authorId)
```

Filter groups with `having` (where `where` filters rows, `having` filters
groups):

```ts
import {gt} from 'rado'

const prolific = await db
  .select({authorId: Post.authorId, posts: count()})
  .from(Post)
  .groupBy(Post.authorId)
  .having(gt(count(), 5))
```

## Aggregating into JSON

To collect grouped values into an array instead of collapsing them, see
[Include](include.md) — or reach for the JSON aggregation functions directly:

```ts
import {jsonAggregateArray} from 'rado'

const titlesPerAuthor = await db
  .select({
    authorId: Post.authorId,
    titles: jsonAggregateArray(Post.title)
  })
  .from(Post)
  .groupBy(Post.authorId)
```

`jsonAggregateArray` compiles to the right function per dialect
(`json_group_array`, `jsonb_agg` or `json_arrayagg`).

## Arbitrary functions

Any SQL function — built-in or extension-provided — can be called through the
`Functions` proxy:

```ts
import {Functions, sql} from 'rado'

const {coalesce} = Functions

await db
  .select({
    name: coalesce(User.name, sql.inline('anonymous'))
  })
  .from(User)
```

The result is typed `Sql<any>`; cast or wrap with a typed
[`sql`](sql.md) expression when you want a precise type:

```ts
const len = sql<number>`length(${User.name})`
```
