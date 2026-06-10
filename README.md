[![npm](https://img.shields.io/npm/v/rado.svg)](https://npmjs.org/package/rado)
[![jsr](https://jsr.io/badges/@rado/rado)](https://jsr.io/@rado/rado)

# rado

A fully typed, lightweight TypeScript query builder for SQLite, PostgreSQL and
MySQL.

```ts
import {eq} from 'rado'

const greatPosts = await db.select().from(Post).where(eq(Post.rating, 5))
```

If you've used [Drizzle ORM](https://orm.drizzle.team), the code above looks
familiar. That's intentional. Rado deliberately aligns its query building
syntax with Drizzle, while making a few different choices under the hood:
simpler types, immutable queries, a much smaller footprint and queries that can
run on any of the supported databases. Read about the project's history in
[Taking the Drizzle challenge](https://ben.mk/notes/taking-the-drizzle-challenge).

## Features

- **Fully typed**: schema definitions drive query and result types, with
  plain, readable TypeScript types
- **Immutable queries**: every method returns a new query, so you can branch
  and reuse query fragments without surprises
- **Universal queries**: write a query once, run it on SQLite, PostgreSQL or
  MySQL, chosen at runtime
- **First-class JSON columns**: select and filter on typed JSON fields with
  plain property access
- **`include` instead of an ORM**: fetch related rows as nested arrays or
  objects inside the query builder, no relations setup required
- **Auto-migrations**: diff your schema against the database and update it
  anywhere, including the browser
- **Zero dependencies, small bundle**: `rado` + the PostgreSQL utilities
  bundle to roughly 8.5 kB gzipped
- **No code generation step**: your schema is just TypeScript

## Installation

```sh
npm install rado
```

Rado is also published on JSR as [@rado/rado](https://jsr.io/@rado/rado) for
Deno users.

## Quick start

```ts
import {eq} from 'rado'
import {integer, pgTable, text} from 'rado/postgres'
import {connect} from 'rado/driver/pg'
import {Pool} from 'pg'

// Define a schema
const User = pgTable('user', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull(),
  email: text().unique()
})

// Connect a database
const db = connect(new Pool({connectionString: process.env.DATABASE_URL}))

// Create the table and start querying
await db.create(User)

await db.insert(User).values({name: 'Ada', email: 'ada@example.com'})

const users = await db.select().from(User).where(eq(User.name, 'Ada'))
```

## Documentation

The full documentation lives in [docs](docs/README.md). A map of the territory:

| Section                                                             | What's inside                                                                                                                                                                             |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Getting started](docs/getting-started.md)                          | Install, connect, define a schema, run your first queries                                                                                                                                 |
| [Drivers](docs/drivers.md)                                          | Every supported driver and how to connect it                                                                                                                                              |
| [Tables](docs/schema/tables.md)                                     | Defining tables, column modifiers, defaults, references                                                                                                                                   |
| [Column types](docs/schema/columns-sqlite.md)                       | Per dialect: [SQLite](docs/schema/columns-sqlite.md), [PostgreSQL](docs/schema/columns-postgres.md), [MySQL](docs/schema/columns-mysql.md), [universal](docs/schema/columns-universal.md) |
| [Indexes & constraints](docs/schema/indexes-and-constraints.md)     | Primary keys, unique constraints, foreign keys, indexes                                                                                                                                   |
| [Views](docs/schema/views.md)                                       | Views and PostgreSQL materialized views                                                                                                                                                   |
| [Schemas & enums](docs/schema/postgres-schemas-and-enums.md)        | `pgSchema` and `pgEnum`                                                                                                                                                                   |
| [Custom column types](docs/schema/custom-types.md)                  | Mapping your own types to and from the database                                                                                                                                           |
| [Select](docs/queries/select.md)                                    | Selections, filtering, ordering, grouping, pagination, locking                                                                                                                            |
| [Joins](docs/queries/joins.md)                                      | Inner/left/right/full/cross joins and lateral variants                                                                                                                                    |
| [Insert](docs/queries/insert.md)                                    | Values, bulk inserts, upserts, insert-from-select                                                                                                                                         |
| [Update](docs/queries/update.md) / [Delete](docs/queries/delete.md) | Modifying and removing rows, `returning`                                                                                                                                                  |
| [Filter operators](docs/queries/operators.md)                       | `eq`, `and`, `or`, `inArray`, `like`, `between` and friends                                                                                                                               |
| [Aggregates](docs/queries/aggregates.md)                            | `count`, `sum`, `avg`, `min`, `max` and grouping                                                                                                                                          |
| [Include](docs/queries/include.md)                                  | Nested results without an ORM                                                                                                                                                             |
| [JSON](docs/queries/json.md)                                        | Typed JSON columns, selecting and filtering nested fields                                                                                                                                 |
| [Set operations](docs/queries/set-operations.md)                    | `union`, `intersect`, `except`                                                                                                                                                            |
| [Subqueries & CTEs](docs/queries/subqueries-and-ctes.md)            | `.as()`, `$with`, recursive CTEs                                                                                                                                                          |
| [The sql tag](docs/queries/sql.md)                                  | Raw SQL escape hatches, safely                                                                                                                                                            |
| [Transactions & batch](docs/runtime/transactions-and-batch.md)      | Atomic operations, rollbacks, batching                                                                                                                                                    |
| [Prepared statements](docs/runtime/prepared-statements.md)          | Placeholders, `prepare`, inspecting generated SQL                                                                                                                                         |
| [Migrations](docs/runtime/migrations.md)                            | `db.create`, `db.migrate` and how diffing works                                                                                                                                           |
| [Universal queries](docs/runtime/universal-queries.md)              | One query, three databases                                                                                                                                                                |
| [Coming from Drizzle](docs/drizzle.md)                              | Side-by-side comparison and migration notes                                                                                                                                               |

## Supported drivers

Pass a database client instance to the matching `connect` function:

```ts
import Database from 'better-sqlite3'
import {connect} from 'rado/driver/better-sqlite3'

const db = connect(new Database('app.db'))
```

| Database   | Package                                                                            | Import                       | Sync/async |
| ---------- | ---------------------------------------------------------------------------------- | ---------------------------- | ---------- |
| PostgreSQL | [pg](https://www.npmjs.com/package/pg)                                             | `rado/driver/pg`             | async      |
| PostgreSQL | [@electric-sql/pglite](https://www.npmjs.com/package/@electric-sql/pglite)         | `rado/driver/pglite`         | async      |
| PostgreSQL | [@neondatabase/serverless](https://www.npmjs.com/package/@neondatabase/serverless) | `rado/driver/pg`             | async      |
| PostgreSQL | [@vercel/postgres](https://www.npmjs.com/package/@vercel/postgres)                 | `rado/driver/pg`             | async      |
| SQLite     | [better-sqlite3](https://www.npmjs.com/package/better-sqlite3)                     | `rado/driver/better-sqlite3` | sync       |
| SQLite     | `bun:sqlite`                                                                       | `rado/driver/bun-sqlite`     | sync       |
| SQLite     | [sql.js](https://www.npmjs.com/package/sql.js)                                     | `rado/driver/sql.js`         | sync       |
| SQLite     | [@libsql/client](https://www.npmjs.com/package/@libsql/client)                     | `rado/driver/libsql`         | async      |
| SQLite     | Cloudflare D1                                                                      | `rado/driver/d1`             | async      |
| MySQL      | [mysql2](https://www.npmjs.com/package/mysql2)                                     | `rado/driver/mysql2`         | async      |

Synchronous drivers give you a fully synchronous database. No `await`
required, although awaiting queries still works. See
[Drivers](docs/drivers.md) for details.

## A taste of the API

### Immutable queries

Queries are values. Branch them, reuse them, store them in variables. Nothing
mutates:

```ts
import {count, gt} from 'rado'

const allUsers = db.select(count()).from(User)
const filtered = allUsers.where(gt(User.id, 1))

const [total] = await allUsers // unaffected by the where above
const [matching] = await filtered
```

### Nested results with `include`

No relations file, no separate query API. Declare the relationship inline:

```ts
import {eq, include} from 'rado'

const usersWithPosts = await db
  .select({
    ...User,
    posts: include(db.select().from(Post).where(eq(Post.authorId, User.id)))
  })
  .from(User)
```

Each row comes back with a typed `posts` array. Use `include.one` for a single
related row. More in [Include](docs/queries/include.md).

### Typed JSON columns

```ts
import {eq} from 'rado'
import {jsonb, pgTable, serial, text} from 'rado/postgres'

const User = pgTable('user', {
  id: serial().primaryKey(),
  name: text(),
  settings: jsonb<{theme: 'light' | 'dark'; notifications: boolean}>()
})

const darkSide = await db
  .select(User.name)
  .from(User)
  .where(eq(User.settings.theme, 'dark'))
```

That `User.settings.theme` is a real, typed expression that compiles to the
correct JSON access syntax for your database. More in
[JSON](docs/queries/json.md).

### Universal queries

Define your schema with `rado/universal` column types and pick the database at
runtime:

```ts
import {table} from 'rado'
import {id, text} from 'rado/universal'

const User = table('user', {
  id: id(), // auto-incrementing primary key on every dialect
  name: text()
})

const db = useSqlite ? sqliteDb : postgresDb
const names = await db.select(User.name).from(User)
```

More in [Universal queries](docs/runtime/universal-queries.md).

### Auto-migrations

```ts
// Compares the defined schema to the actual database and applies the diff
await db.migrate(User, Post)
```

Works in Node.js, Bun, Deno and the browser. It is powerful and a little
direct, so read [Migrations](docs/runtime/migrations.md) before pointing it at
production.

## Coming from Drizzle?

Most queries port by changing imports:

```ts
import {sql, eq, and, or} from 'rado' // was 'drizzle-orm'
import {pgTable, integer, text} from 'rado/postgres' // was 'drizzle-orm/pg-core'
import {sqliteTable} from 'rado/sqlite' // was 'drizzle-orm/sqlite-core'
import {mysqlTable} from 'rado/mysql' // was 'drizzle-orm/mysql-core'
```

Rado also exposes compatibility helpers such as `InferSelectModel`,
`InferInsertModel`, `getTableColumns` and `TransactionRollbackError`. See
[Coming from Drizzle](docs/drizzle.md) for a full side-by-side comparison of
what's the same, what's better and what's missing.

## License

MIT
