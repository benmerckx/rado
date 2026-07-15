# Delete

Remove rows with `db.delete(Table)`.

```ts
import {eq} from 'rado'

await db.delete(User).where(eq(User.id, 1))
```

> `db.delete(User)` without a `where` deletes **all rows**. This is valid SQL
> and rado won't stop you. Triple-check, then check again.

## Conditions

`where` accepts the same operators as select. See
[Filter operators](operators.md):

```ts
import {and, inArray, lt} from 'rado'

await db
  .delete(Post)
  .where(and(eq(Post.published, false), lt(Post.createdAt, cutoff)))

await db.delete(Post).where(inArray(Post.id, [1, 2, 3]))
```

Subqueries work too:

```ts
const inactiveUsers = db
  .select(User.id)
  .from(User)
  .where(eq(User.active, false))

await db.delete(Post).where(inArray(Post.authorId, inactiveUsers))
```

## Returning deleted rows (PostgreSQL/SQLite)

```ts
const removed = await db
  .delete(Post)
  .where(eq(Post.published, false))
  .returning(Post.id)
```

## Ordering and limiting

Where the dialect allows it:

```ts
await db.delete(LogEntry).orderBy(asc(LogEntry.createdAt)).limit(1000)
```
