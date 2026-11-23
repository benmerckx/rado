# Coming from Drizzle

Rado deliberately aligns its query building API with
[Drizzle ORM](https://orm.drizzle.team). There is no reason for people to
learn two slightly different ways to spell the same SQL. If you know Drizzle,
you mostly know rado already. This page collects everything comparison-related
in one place: what's identical, what's different, what's missing, and how to
port a project.

For the full origin story, read
[Taking the Drizzle challenge](https://ben.mk/notes/taking-the-drizzle-challenge).

## Summary

Rado might be for you if you like Drizzle but:

- aren't using its ORM/relations features
- want simpler, faster TypeScript types
- want to choose the database at runtime, not build time
- want a lightweight dependency (~8.5 kB gzipped with Postgres utilities,
  versus ~20.9 kB for the Drizzle equivalent)
- want migrations that run anywhere, including the browser

Mind the trade-offs: rado has a much smaller ecosystem and no drizzle-kit.

## Changing imports

Most code ports by swapping import sources:

| Drizzle                      | Rado                         |
| ---------------------------- | ---------------------------- |
| `drizzle-orm`                | `rado`                       |
| `drizzle-orm/pg-core`        | `rado/postgres`              |
| `drizzle-orm/sqlite-core`    | `rado/sqlite`                |
| `drizzle-orm/mysql-core`     | `rado/mysql`                 |
| `drizzle-orm/better-sqlite3` | `rado/driver/better-sqlite3` |
| `drizzle-orm/node-postgres`  | `rado/driver/pg`             |
| `drizzle-orm/mysql2`         | `rado/driver/mysql2`         |

```ts
import {sql, eq, and, or} from 'rado' // was 'drizzle-orm'
import {pgTable, integer, text} from 'rado/postgres' // was 'drizzle-orm/pg-core'
```

Connecting differs slightly: rado's driver modules export `connect` rather
than `drizzle`:

```ts
// Drizzle
const db = drizzle(new Database('app.db'))
// Rado
const db = connect(new Database('app.db'))
```

## What's the same

Tables, columns, operators and query chaining will all feel familiar:

```ts
// This is valid in both libraries
const users = await db
  .select({id: User.id, name: User.name})
  .from(User)
  .leftJoin(Post, eq(Post.authorId, User.id))
  .where(and(gt(User.id, 10), isNull(User.email)))
  .orderBy(desc(User.id))
  .limit(10)
```

So are `insert().values().onConflictDoUpdate()`, `update().set()`,
`delete()`, `returning()`, `$with`/`with` CTEs, `union` and friends,
`sql` templates with `sql.placeholder`, `.prepare()`, transactions with
`tx.rollback()`, `$dynamic()`, `$count`, and column modifier chains like
`.notNull().default()`.

Rado also ships Drizzle-named compatibility helpers so common type-level code
ports unchanged:

```ts
import type {InferInsertModel, InferSelectModel, SQL, SQLWrapper} from 'rado'
import {getTableColumns, TransactionRollbackError} from 'rado'
```

## What's different

### Queries are immutable

In rado every method returns a new query, so partial queries are reusable:

```ts
const base = db.select(count()).from(User)
const over1 = base.where(gt(User.id, 1)) // base is untouched
const over2 = base.where(gt(User.id, 2)) // so this works as expected
```

In Drizzle, chained methods mutate the query in place (hence its `$dynamic()`
workaround being mandatory for reuse). Rado keeps `$dynamic()` purely as a
typing convenience for reassignment loops.

### `include` instead of the relational query API

Drizzle has a second API (`db.query.users.findMany({with: ...})`) backed by a
separately declared relations file. Rado expresses the same single-query
nested fetch inside the regular builder:

```ts
// Rado
const users = await db
  .select({
    id: User.id,
    name: User.name,
    posts: include(
      db
        .select({id: Post.id, title: Post.title})
        .from(Post)
        .where(eq(Post.userId, User.id))
    )
  })
  .from(User)

// Drizzle
const usersRelations = relations(User, ({many}) => ({posts: many(Post)}))
const users = await db.query.users.findMany({
  columns: {id: true, name: true},
  with: {posts: {columns: {id: true, title: true}}}
})
```

One API to learn; selection and filtering work the same at every nesting
level. See [Include](queries/include.md).

### Selecting a bare field

Rado lets a selection be a single expression, yielding an array of values:

```ts
const names = await db.select(User.name).from(User) // Array<string>
```

Drizzle requires an object selection.

### Universal queries

Rado queries can be written once and executed against SQLite, PostgreSQL or
MySQL chosen at runtime, via `rado/universal` column types. Drizzle requires
committing to a dialect at build time. See
[Universal queries](runtime/universal-queries.md).

### Migrations

Drizzle ships drizzle-kit, a separate (closed-source, heavyweight) package
that generates `.sql` migration files on disk. Rado builds in a single
declarative function:

```ts
import * as schema from './schema.ts'

await push(db, schema)
```

`push` from `rado/sqlite/push` (or the postgres and mysql equivalents) diffs
schema against database and applies changes on the spot, anywhere, including
browsers and edge runtimes. It refuses
changes that lose data unless forced, and `push.plan` shows what would run.
See [Schema push](runtime/push.md).

For reviewed production changes, `generate` writes the SQL push would run
into a migration file, and `migrate` applies the files on startup and keeps
a history. Instead of snapshot files, generate replays your existing
migrations on a scratch database, so hand edits are part of what it compares
against. See [Migrations](runtime/migrations.md).

### Simpler types

Rado's public types take at most a few generic parameters and use a fraction
of the conditional types (about an order of magnitude fewer than Drizzle's
codebase). In practice: faster type-checking, readable tooltips, and
`Database`/`Select`/`Table` types you can actually write in annotations
without filling in a row of `any`s.

## Deliberate departures

These are decisions, not gaps waiting to be filled:

- **No callbacks where a value will do.** Columns, tables and conditions are
  passed directly. Callbacks exist only where the value can't exist yet: the
  table config (`self => ({...})`) for composite constraints,
  `.references(() => User.id)` for forward and circular references, and
  recursive CTEs (`unionAll(self => ...)`).
- **No metadata getters** like `getTableConfig`, `getViewConfig`,
  `getTableName` or `is()`. A table is already its own column map, and
  everything else stays internal. `getTableColumns` only exists as a
  compatibility alias that returns the table.
- **No validator generation** (zod, valibot, typebox). Validate input where it
  enters your app; the row types come from `InferSelectModel` and
  `InferInsertModel`.
- **Functions mirror the database.** Helpers such as the sqlite functions or
  vector operators are ported when the database (or a common extension like
  pgvector) ships them, not invented on top.

## What's missing

- **The relational query API** (`db.query.*.findMany`): by design; use
  [Include](queries/include.md)
- **drizzle-kit** extras: no snapshots, no down migrations and no studio.
  [Migrations](runtime/migrations.md) are plain SQL files
- **Ecosystem**: Drizzle has integrations, studio tooling and a large
  community; rado is a focused query builder
- Some driver coverage: rado supports the
  [drivers listed here](drivers.md); Drizzle supports more
