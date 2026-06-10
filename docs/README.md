# Rado documentation

Welcome. Rado is a fully typed, lightweight TypeScript query builder for
SQLite, PostgreSQL and MySQL. These docs walk you through everything from your
first `select` to recursive CTEs and auto-migrations.

If you're in a hurry, start with [Getting started](getting-started.md). If
you're coming from Drizzle ORM, jump straight to
[Coming from Drizzle](drizzle.md) — most of your muscle memory transfers.

## Table of contents

### Start here

- [Getting started](getting-started.md) — install, connect, define, query
- [Drivers](drivers.md) — connecting every supported database client

### Defining your schema

- [Tables](schema/tables.md) — `table`, column modifiers, defaults, references, aliases
- [SQLite column types](schema/columns-sqlite.md)
- [PostgreSQL column types](schema/columns-postgres.md)
- [MySQL column types](schema/columns-mysql.md)
- [Universal column types](schema/columns-universal.md) — columns that work on every dialect
- [Indexes & constraints](schema/indexes-and-constraints.md) — primary keys, unique, foreign keys, indexes
- [Views](schema/views.md) — views and materialized views
- [PostgreSQL schemas & enums](schema/postgres-schemas-and-enums.md) — `pgSchema`, `pgEnum`
- [Custom column types](schema/custom-types.md) — map your own types

### Querying

- [Select](queries/select.md) — selections, `where`, ordering, grouping, pagination, locking
- [Joins](queries/joins.md) — every join flavor, including lateral
- [Insert](queries/insert.md) — values, bulk inserts, upserts, insert-from-select
- [Update](queries/update.md) — `set`, `where`, `returning`
- [Delete](queries/delete.md) — removing rows
- [Filter operators](queries/operators.md) — `eq`, `and`, `or`, `inArray` and the rest
- [Aggregates](queries/aggregates.md) — `count`, `sum`, `avg`, `min`, `max`
- [Include](queries/include.md) — nested results without an ORM
- [JSON](queries/json.md) — typed JSON columns
- [Set operations](queries/set-operations.md) — `union`, `intersect`, `except`
- [Subqueries & CTEs](queries/subqueries-and-ctes.md) — `.as()`, `$with`, recursion
- [The sql tag](queries/sql.md) — raw SQL, safely interpolated

### Running queries

- [Transactions & batch](runtime/transactions-and-batch.md) — atomicity, rollbacks, batching
- [Prepared statements](runtime/prepared-statements.md) — placeholders, `prepare`, `toSQL`
- [Migrations](runtime/migrations.md) — `db.create`, `db.drop`, `db.migrate`
- [Universal queries](runtime/universal-queries.md) — one query, any database

### Background

- [Coming from Drizzle](drizzle.md) — comparison, compatibility helpers, migration notes

## Conventions used in these docs

Unless noted otherwise, examples assume a connected database instance named
`db` and tables defined like this:

```ts
import {table} from 'rado'
import {boolean, id, integer, text} from 'rado/universal'

const User = table('user', {
  id: id(),
  name: text().notNull(),
  email: text()
})

const Post = table('post', {
  id: id(),
  authorId: integer().notNull(),
  title: text().notNull(),
  published: boolean().default(false)
})
```

Most examples run identically on SQLite, PostgreSQL and MySQL. Where a feature
is dialect-specific (say, `ilike` or materialized views) the page says so.
