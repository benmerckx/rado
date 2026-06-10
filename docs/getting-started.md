# Getting started

Five minutes from `npm install` to typed query results. Here's the whole
journey: install, connect, define a schema, create tables, query.

## Install

```sh
npm install rado
```

You'll also need a database driver. Rado doesn't ship one — it wraps the
client you already use. For this guide we'll use SQLite via
[better-sqlite3](https://www.npmjs.com/package/better-sqlite3):

```sh
npm install better-sqlite3
```

Using Deno? Rado is on JSR as
[@rado/rado](https://jsr.io/@rado/rado).

## Connect

Every driver lives under `rado/driver/*` and exports a `connect` function that
takes an instance of the underlying client:

```ts
import Database from 'better-sqlite3'
import {connect} from 'rado/driver/better-sqlite3'

const db = connect(new Database('app.db'))
```

That's the only driver-specific line you'll write. Everything that follows is
identical for PostgreSQL and MySQL — see [Drivers](drivers.md) for the full
list of supported clients.

One nice detail: better-sqlite3 is a synchronous driver, so `db` is a
*synchronous* database. You can `await` queries (they're thenable), or skip the
`await` entirely and get results right away. Async drivers like `pg` give you
an async database where `await` is required. The query building API is the
same either way.

## Define a schema

A table is a name plus an object of columns. Column types come from the
dialect module — `rado/sqlite` here:

```ts
import {sqliteTable} from 'rado/sqlite'
import {integer, text} from 'rado/sqlite'

const User = sqliteTable('user', {
  id: integer().primaryKey({autoIncrement: true}),
  name: text().notNull(),
  email: text().unique()
})

const Post = sqliteTable('post', {
  id: integer().primaryKey({autoIncrement: true}),
  authorId: integer()
    .notNull()
    .references(() => User.id),
  title: text().notNull(),
  body: text()
})
```

A few things to notice:

- Column names are inferred from the property names. `name: text()` creates a
  column named `name`. Pass a string (`text('full_name')`) only when the
  database column name differs from the property.
- Modifiers chain: `.notNull()`, `.unique()`, `.primaryKey()`, `.default()`,
  `.references()`. They also narrow the TypeScript types — a `.notNull()`
  column won't be `| null` in your results.
- `sqliteTable` is a dialect-typed version of the generic `table` export from
  `rado`. If you want schema that runs on any database, use `table` with
  column types from `rado/universal` — see
  [Universal queries](runtime/universal-queries.md).

More on all of this in [Tables](schema/tables.md).

## Create the tables

```ts
db.create(User, Post)
```

`db.create` emits `create table` (and any index) statements. For evolving an
existing database to match your schema, there's `db.migrate` — see
[Migrations](runtime/migrations.md).

## Insert some rows

```ts
db.insert(User).values([
  {name: 'Ada Lovelace', email: 'ada@example.com'},
  {name: 'Grace Hopper', email: 'grace@example.com'}
])

const ada = db
  .select()
  .from(User)
  .where(eq(User.email, 'ada@example.com'))
  .get() // .get() returns the first row (or undefined)

db.insert(Post).values({
  authorId: ada.id,
  title: 'Notes on the Analytical Engine'
})
```

Inserted values are type-checked against the table definition: required
columns must be present, columns with defaults are optional, unknown keys are
rejected. Forget `name` and TypeScript complains before SQLite ever gets the
chance.

## Query

```ts
import {eq} from 'rado'

// Everything
const users = db.select().from(User)
// [{id: 1, name: 'Ada Lovelace', email: 'ada@example.com'}, ...]

// A subset of columns — results are typed accordingly
const names = db.select({id: User.id, name: User.name}).from(User)

// A single expression — results are an array of values, not objects
const justNames = db.select(User.name).from(User)
// ['Ada Lovelace', 'Grace Hopper']

// With a join
const postsWithAuthors = db
  .select({title: Post.title, author: User.name})
  .from(Post)
  .innerJoin(User, eq(Post.authorId, User.id))
```

Queries are immutable: every method returns a new query, so you can build a
base query once and branch it freely:

```ts
const posts = db.select().from(Post)
const byAda = posts.where(eq(Post.authorId, ada.id))
const recent = posts.orderBy(desc(Post.id)).limit(10)
// `posts` itself is untouched and still queries everything
```

## Where to next?

- [Select](queries/select.md) for filtering, ordering, grouping, pagination
- [Filter operators](queries/operators.md) for the full `eq`/`and`/`or` toolbox
- [Insert](queries/insert.md), [Update](queries/update.md), [Delete](queries/delete.md)
- [Include](queries/include.md) to fetch related rows as nested results
- [Transactions & batch](runtime/transactions-and-batch.md) when one statement isn't enough
