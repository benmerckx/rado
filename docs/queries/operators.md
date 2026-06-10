# Filter operators

All comparison and logical operators are exported from `rado`. Each returns a
typed boolean SQL expression you can pass to `where`, `having`, join
conditions or combine with other operators.

```ts
import {and, eq, gt, inArray, isNull, like, not, or} from 'rado'
```

## Comparison

| Operator    | SQL      | Example                |
| ----------- | -------- | ---------------------- |
| `eq(a, b)`  | `a = b`  | `eq(User.id, 1)`       |
| `ne(a, b)`  | `a <> b` | `ne(User.name, 'Ada')` |
| `gt(a, b)`  | `a > b`  | `gt(Post.views, 100)`  |
| `gte(a, b)` | `a >= b` | `gte(User.age, 18)`    |
| `lt(a, b)`  | `a < b`  | `lt(Post.views, 10)`   |
| `lte(a, b)` | `a <= b` | `lte(User.age, 65)`    |

Both sides are typed: `eq(User.id, 'one')` is a compile error if `id` is a
number. Columns can be compared to other columns, expressions, subqueries and
plain values:

```ts
eq(Post.authorId, User.id)              // column to column
eq(User.id, 1)                          // column to value
eq(sql`lower(${User.name})`, 'ada')     // expression to value
```

## Null checks

```ts
isNull(User.email)     // "email" is null
isNotNull(User.email)  // "email" is not null
```

## Logical combinators

```ts
and(eq(User.active, true), gt(User.id, 10))
or(eq(User.name, 'Ada'), eq(User.name, 'Grace'))
not(eq(User.name, 'Ada'))
```

`and`/`or` skip `undefined` arguments, which makes conditional filters easy
to assemble:

```ts
where(
  and(
    eq(Post.published, true),
    authorId !== undefined ? eq(Post.authorId, authorId) : undefined
  )
)
```

## Membership

```ts
inArray(User.id, [1, 2, 3])      // "id" in (1, 2, 3)
notInArray(User.id, [1, 2, 3])

// Subqueries are accepted directly
inArray(Post.authorId, db.select(User.id).from(User).where(...))
```

Edge case handled for you: `inArray(x, [])` compiles to `false` (and
`notInArray(x, [])` to `true`) instead of producing invalid SQL.

## Ranges

```ts
between(Post.views, 10, 100)     // "views" between 10 and 100
notBetween(Post.views, 10, 100)
```

## Pattern matching

```ts
like(User.name, 'A%')        // case-sensitive
notLike(User.name, 'A%')
ilike(User.name, 'a%')       // case-insensitive (PostgreSQL)
notILike(User.name, 'a%')
```

## Arrays (PostgreSQL)

For [array columns](../schema/columns-postgres.md#arrays):

```ts
arrayContains(Post.tags, ['sql'])         // tags @> '{sql}'
arrayContained(Post.tags, ['sql', 'ts'])  // tags <@ '{sql,ts}'
arrayOverlaps(Post.tags, ['sql', 'ts'])   // tags && '{sql,ts}'
```

## Existence

```ts
import {exists} from 'rado'

await db
  .select()
  .from(User)
  .where(exists(db.select().from(Post).where(eq(Post.authorId, User.id))))
```

## Conditional expressions with `when`

A typed `case` expression, in two flavors:

```ts
import {when} from 'rado'

// case when <condition> then <value> ... else <fallback> end
const label = when(
  [lt(User.age, 18), 'minor'],
  [gte(User.age, 65), 'senior'],
  'adult' // else
)

// case <subject> when <value> then <result> ... end
const parity = when(
  sql<number>`${User.id} % 2`,
  [0, 'even'],
  [1, 'odd']
)

await db.select({name: User.name, label}).from(User)
```

## Sorting helpers

`asc` and `desc` wrap expressions for `orderBy`:

```ts
import {asc, desc} from 'rado'

db.select().from(User).orderBy(asc(User.name), desc(User.id))
```

## When you need more

Anything missing from this page can be written with the
[`sql` tag](sql.md) — fully typed and parameterized:

```ts
where(sql<boolean>`${User.name} similar to ${pattern}`)
```
