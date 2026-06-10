# Universal queries

A rado specialty: write a schema and queries once, run them on SQLite,
PostgreSQL or MySQL — picked at runtime, not build time.

## Why

Some software can't know its database in advance. A self-hostable app might
run on SQLite locally and Postgres in production. A library shipping embedded
storage wants users to bring their own engine. A test suite wants to run the
same logic on every supported driver. Universal queries make all of these a
configuration detail instead of an architecture problem.

## The recipe

**1. Define the schema with universal columns:**

```ts
import {table} from 'rado'
import {boolean, id, json, text} from 'rado/universal'

const User = table('user', {
  id: id(),
  name: text().notNull(),
  active: boolean().default(true),
  settings: json<{theme: string}>()
})
```

Each universal column emits the correct SQL type per dialect — see the
[type table](../schema/columns-universal.md#available-types).

**2. Connect whichever driver the environment dictates:**

```ts
import {connect as sqlite} from 'rado/driver/better-sqlite3'
import {connect as postgres} from 'rado/driver/pg'

const db = process.env.DATABASE_URL
  ? postgres(new Pool({connectionString: process.env.DATABASE_URL}))
  : sqlite(new Database('local.db'))
```

**3. Query as usual:**

```ts
const names = await db.select(User.name).from(User).where(eq(User.active, true))
```

The same query object emits dialect-correct SQL for whatever database executes
it — identifier quoting, parameter style, JSON access syntax, boolean
representation, all handled.

## Typing universal code

A function that should accept any database can use the generic `Database`
type:

```ts
import type {Database} from 'rado'

async function countUsers(db: Database) {
  return db.$count(User)
}
```

Sync- or dialect-specific code can narrow:
`SyncDatabase<'sqlite'>`, `AsyncDatabase<'postgres'>` and friends.

## Dialect-specific corners

When one database needs special treatment, `sql.universal` localizes the
difference to a single expression:

```ts
import {sql} from 'rado'

const epochNow = sql.universal({
  sqlite: sql`unixepoch()`,
  postgres: sql`extract(epoch from now())::int`,
  mysql: sql`unix_timestamp()`
})
```

And since [migrations](migrations.md) run through the same dialect machinery,
`db.migrate(User)` keeps any of the three databases in sync with the same
schema definition.

## What to watch out for

- Stick to features all your target databases share (the types help: e.g.
  `returning` won't be offered on a MySQL-typed database)
- Test against every engine you claim to support — rado's own test suite does
  exactly this, running shared integration tests over all drivers
- Column behaviors at the edges differ (numeric precision, date handling);
  the universal column types pick safe mappings, but verify your edge cases
