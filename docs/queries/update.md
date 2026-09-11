# Update

Modify existing rows with `db.update(Table).set(...)`.

```ts
import {eq} from 'rado'

await db.update(User).set({name: 'Ada Lovelace'}).where(eq(User.id, 1))
```

> No `where`? Then you're updating every row in the table. Rado will happily
> do exactly what you asked.

## Setting values

`set` takes a partial row, type-checked against the table. Values can be
literals or SQL expressions, including ones referencing the current row:

```ts
import {sql} from 'rado'

await db
  .update(Post)
  .set({
    title: sql`upper(${Post.title})`,
    views: sql`${Post.views} + 1`
  })
  .where(eq(Post.id, 1))
```

Setting a nullable column to `null` works as expected:

```ts
await db.update(User).set({email: null}).where(eq(User.id, 1))
```

Columns declared with [`$onUpdate`](../schema/tables.md#onupdatefn--onupdatefnfn)
are refreshed automatically on every update.

## Updating from another table

Use `from` when update values or conditions refer to another table:

```ts
await db
  .update(User)
  .set({cityId: City.id})
  .from(City)
  .where(eq(User.cityName, City.name))
```

PostgreSQL and SQLite emit `update ... set ... from ...`; MySQL emits its
equivalent multiple-table `update ... join ... set ...` form.

## Scalar subqueries

Queries selecting exactly one column can be used directly as parenthesized SQL
expressions. This also works for
correlated subqueries:

```ts
const latestTitle = db
  .select(Post.title)
  .from(Post)
  .where(eq(Post.userId, User.id))
  .orderBy(desc(Post.id))
  .limit(1)

await db.update(User).set({latestPostTitle: latestTitle})
```

## Returning updated rows (PostgreSQL/SQLite)

```ts
const updated = await db
  .update(User)
  .set({name: 'Grace'})
  .where(eq(User.id, 2))
  .returning()

const justNames = await db
  .update(User)
  .set({name: 'Grace'})
  .where(eq(User.id, 2))
  .returning(User.name)
```

## Ordering and limiting

Some dialects allow updates to be ordered and limited:

```ts
await db
  .update(Task)
  .set({assigned: true})
  .where(eq(Task.assigned, false))
  .orderBy(asc(Task.createdAt))
  .limit(1)
```
