# Set operations

Combine the results of multiple selects with `union`, `intersect` and
`except`. Available both as chained methods and as standalone functions.

```ts
import {union} from 'rado'

const names = await union(
  db.select(User.name).from(User),
  db.select(Author.name).from(Author)
)
```

## The operations

| Operation      | Keeps                                      |
| -------------- | ------------------------------------------ |
| `union`        | rows in either query, duplicates removed   |
| `unionAll`     | rows in either query, duplicates kept      |
| `intersect`    | rows present in both queries               |
| `intersectAll` | same, duplicates kept (PostgreSQL/MySQL)   |
| `except`       | rows in the first query but not the second |
| `exceptAll`    | same, duplicates kept (PostgreSQL/MySQL)   |

Both queries must select the same shape — TypeScript enforces this.

## Chained style

```ts
const combined = await db
  .select({name: User.name})
  .from(User)
  .union(db.select({name: Author.name}).from(Author))
```

## Function style

The functions take two or more queries:

```ts
import {unionAll} from 'rado'

const everything = await unionAll(
  db.select(User.name).from(User),
  db.select(Author.name).from(Author),
  db.select(Commenter.name).from(Commenter)
)
```

## Ordering and limiting the combined result

A set operation is itself a query — chain `orderBy`, `limit` and `offset` on
the result:

```ts
const page = await union(
  db.select({name: User.name}).from(User),
  db.select({name: Author.name}).from(Author)
)
  .orderBy(sql`name`)
  .limit(10)
```

## Using a union as a subquery

Like selects, set operations can be named with `.as()` and used as a source:

```ts
const allNames = union(
  db.select({name: User.name}).from(User),
  db.select({name: Author.name}).from(Author)
).as('allNames')

const counted = await db.select(count()).from(allNames)
```
