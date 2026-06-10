# Views

A view is a stored query you can select from like a table. Rado supports
plain views on every dialect and materialized views on PostgreSQL.

## Defining a view from a query

Give `view` a name and a select query. The columns (and their types) are
inferred from the selection:

```ts
import {eq, view} from 'rado'

const ActiveUsers = view('active_users').as(
  db
    .select({id: User.id, name: User.name})
    .from(User)
    .where(eq(User.active, true))
)
```

Create it, then query it like any table:

```ts
await db.create(ActiveUsers)

const actives = await db.select().from(ActiveUsers)
const one = await db
  .select(ActiveUsers.name)
  .from(ActiveUsers)
  .where(eq(ActiveUsers.id, 1))
```

## Defining a view with explicit columns

When the body is raw SQL (or you want full control over types), declare the
columns yourself:

```ts
import {sql, view} from 'rado'
import {integer, text} from 'rado/universal'

const UserNames = view('user_names', {
  id: integer(),
  name: text()
}).as(sql`select ${User.id}, ${User.name} from ${User}`)
```

## Using an existing view

If the view already exists in the database (created by another tool or a
migration), skip the body and mark it as existing:

```ts
const Reporting = view('reporting', {
  total: integer(),
  region: text()
}).existing()

// .existing() views are never created or dropped by rado, just queried
const rows = await db.select().from(Reporting)
```

## Materialized views (PostgreSQL)

Materialized views store their results physically and must be refreshed:

```ts
import {pgMaterializedView} from 'rado/postgres'

const Stats = pgMaterializedView('stats').as(
  db
    .select({authorId: Post.authorId, posts: count()})
    .from(Post)
    .groupBy(Post.authorId)
)

await db.create(Stats)

// Data is frozen at creation/refresh time. Refresh when needed:
await db.refreshMaterializedView(Stats)
```

`pgView` is also exported from `rado/postgres` as the dialect-typed sibling of
`view`.

## Views inside a Postgres schema

Views can live inside a named schema via `pgSchema`:

```ts
import {pgSchema} from 'rado/postgres'

const reporting = pgSchema('reporting')
const Totals = reporting.view('totals').as(...)
const CachedTotals = reporting.materializedView('cached_totals').as(...)
```

See [PostgreSQL schemas & enums](postgres-schemas-and-enums.md).

## Creating and dropping

Views participate in `db.create` and `db.drop` like tables. Order matters:
create the tables a view depends on first, and drop the view before its tables:

```ts
await db.create(User, ActiveUsers)
// ...
await db.drop(ActiveUsers, User)
```
