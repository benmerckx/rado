# Migrations

Rado takes a direct approach to schema management: describe your schema in
code, then ask the database to match it.

## Creating from scratch

`db.create` emits `create table` statements (plus indexes, enums, views,
schemas) for everything you pass it:

```ts
await db.create(User, Post)
```

Dropping is the mirror image:

```ts
await db.drop(Post, User)
```

## Auto-migration with `db.migrate`

For an existing database, `db.migrate` *diffs* each table you pass against
what's actually in the database and applies the difference:

```ts
await db.migrate(User, Post)
```

What it handles:

- creating missing tables
- adding, removing and altering columns
- adding, removing and updating indexes and constraints
- on SQLite, recreating the table when an incompatible change requires it
  (data is carried over)

Everything runs inside a transaction: either the schema ends up matching, or
nothing changed.

Because it's plain JavaScript talking to your driver, it works everywhere
rado works: Node.js, Bun, Deno, Cloudflare Workers and the browser
(PGlite/sql.js). No CLI, no `.sql` files on disk, no filesystem at all.

## A word of warning

`db.migrate` is *declarative and destructive*. If your code no longer
mentions a column, the migration drops it — along with its data. That's the
contract: the database ends up matching the code.

Treat it accordingly:

- great for development, tests, embedded databases, local-first apps and
  small projects
- for production databases you care about, prefer reviewing changes: use a
  dedicated migration tool such as
  [dbmate](https://github.com/amacneil/dbmate) and keep rado for querying
- back up before migrating anything irreplaceable

## How renames are detected

A renamed *property* with an explicit column name keeps its identity:

```ts
// before
const T = table('t', {fieldA: varchar('field_a', {length: 10})})
// after — property renamed, column name kept: no data loss
const T = table('t', {fieldB: varchar('field_a', {length: 10})})
```

A changed *column name* is a drop-and-add. When in doubt, inspect what would
run (see below).

## Running raw migration SQL

For hand-rolled migrations the [`sql` tag](../queries/sql.md) and `db.run`
have you covered:

```ts
await db.run(sql`alter table ${User} add column "bio" text`)
```

Combined with `db.batch` and `db.transaction`, that's enough to build your
own migration runner with versioning if you need one.
