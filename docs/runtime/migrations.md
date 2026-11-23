# Migrations

[Push](push.md) changes a database to match your schema on the spot.
Migrations go through a file instead: `generate` writes the SQL that push
would run, you review and commit it, and `migrate` runs every file a
database hasn't seen yet, once, in order.

```ts
import {generate} from 'rado/postgres/generate'
import {migrate} from 'rado/migrate'
```

## The workflow

### 1. Write the schema

Define your tables as usual, in a module you can import as a whole:

```ts
// schema.ts
import {table} from 'rado'
import {id, text} from 'rado/universal'

export const User = table('user', {
  id: id(),
  name: text().notNull()
})
```

### 2. Generate

`generate` takes the migrations you already have and the schema, and returns
the SQL that takes a database from the one to the other:

```ts
// scripts/generate.ts
import {writeFile} from 'node:fs/promises'
import {read} from 'rado/migrate/fs'
import {generate} from 'rado/postgres/generate'
import * as schema from '../src/schema.ts'

const migrations = await read('migrations')
const sql = await generate(migrations, schema)
if (sql) await writeFile(`migrations/${Date.now()}_change.sql`, sql + '\n')
```

Each statement ends with `;` and statements are separated by blank lines.
An empty string means the migrations already match the schema.

Import `generate` from the entry for your database:

| Database   | Import                                            |
| ---------- | ------------------------------------------------- |
| SQLite     | `import {generate} from 'rado/sqlite/generate'`   |
| PostgreSQL | `import {generate} from 'rado/postgres/generate'` |
| MySQL      | `import {generate} from 'rado/mysql/generate'`    |

### 3. Write the file

Read the file before committing it, and edit it where you know better than
the generator: fill a new column from an old one, split a change in two, add
a data fix. Statements that may lose data come with a comment line above
them:

```sql
alter table "public"."user" rename column "name" to "full_name";

-- Drops column "bio"
alter table "public"."user" drop column "bio";
```

Push can't tell a renamed column from a dropped one and a new one, so pass
the same rename hints as push:

```ts
await generate(migrations, schema, {rename: {'user.name': 'full_name'}})
```

### 4. Migrate on startup

`migrate` runs the files a database hasn't applied yet and returns their
names:

```ts
import {migrate} from 'rado/migrate'

const migrations = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true
})

await migrate(db, migrations)
```

Migrations are a plain record from file name to SQL, the shape Vite's
`import.meta.glob` returns. On a server, `read` from `rado/migrate/fs` reads
the `.sql` files of a directory into the same record, on Node, Bun and Deno:

```ts
import {read} from 'rado/migrate/fs'

await migrate(db, await read('migrations'))
```

`rado/migrate` itself imports nothing from Node, so it bundles for browsers
and edge runtimes.

`migrate.pending(db, migrations)` returns the names that haven't run, without
changing anything. Like queries, both return their result directly on a
synchronous driver and a promise on an asynchronous one.

### 5. Baseline an existing database

A database that already has the schema, created by push or by hand, has no
history yet. Generate the first migration against an empty database as
usual, then mark it as applied there without running it:

```ts
await migrate(db, migrations, {baseline: '0001_init'})
```

Every migration up to and including the baseline is recorded without
running, and the ones after it run. The baseline only applies while the
history is empty, so it is safe to leave in place; an unknown name is an
error.

## No snapshot files

Generate doesn't keep a JSON snapshot of the schema next to the migrations.
It starts a scratch database, the shadow, runs every migration on it in
order and then compares your schema with the result, using push. What it
compares against is the real SQL, so a hand edit in a migration, a data fix
or a statement the generator doesn't know about counts, and there is no
second copy of the schema that can drift from the files.

The shadow must be empty, otherwise generate fails with
`Expected an empty database`. Without one, generate starts one in memory:

- SQLite: the runtime's own, `bun:sqlite` on Bun and `node:sqlite` on Node
  and Deno, nothing to install
- PostgreSQL: [PGlite](https://pglite.dev)
- MySQL: [mysql-wasm](https://www.npmjs.com/package/mysql-wasm)

PGlite and mysql-wasm are optional peer dependencies: install the one you
need as a dev dependency, or pass a database of your own, for example a
container started for this:

```ts
await generate(migrations, schema, {shadow: db})
```

A database you pass stays open, the default one is closed when generate is
done. Generate only exists in these entries, so an app that pushes or
migrates never bundles the code that loads a shadow.

What generate covers is what push covers, see [Schema push](push.md). The
shadow has no rows, so nothing is refused for data: every statement push
would refuse when a table holds data gets its comment instead, and there is
no `force` option. On PostgreSQL push names each table with its schema, so
the files do too.

## Files and history

A migration's name is its file name without the directory and `.sql`, and
migrations run sorted by name. Prefix them with a number or a timestamp so
they sort in the order they were written. Two files with the same name are
an error.

The history lives in a `rado_migrations` table, created on first use, with
each applied name, a checksum of its SQL and when it ran. Before running
anything, `migrate` checks the history against the files:

- a file changed after it was applied:
  `Migration 0001_init changed after it was applied`
- an applied file is gone: `Migration 0001_init was applied but is missing`

Line endings don't count, so a checkout with CRLF matches. Each file runs as
one call to the driver, with all its statements; rado doesn't split SQL.

## Transactions and locking

When two processes start at the same time, one waits for the other, then
finds nothing left to run.

- PostgreSQL: one transaction for the whole run, holding an advisory lock
  (`pg_advisory_xact_lock`). A failing file rolls back every file of the
  run.
- SQLite: one `immediate` transaction for the whole run, with the same
  rollback.
- MySQL commits implicitly after each DDL statement, so a run can't be rolled
  back. It holds `get_lock('rado_migrations')` on one connection and records
  each file right after it succeeds. A failing file stops the run with
  `Migration 0003_x failed and may be partially applied`: the statements
  before the failing one stay, so fix the database or the file by hand.
  Don't run `migrate` inside your own MySQL transaction.
- Drivers without transactions, such as Cloudflare D1, run the files in
  order without a lock, recording each after it succeeds. Make sure only one
  process migrates at a time. D1 runs each line of a file as one statement:
  keep a statement on a single line, as generate writes them.

Some drivers can't send several statements in one call:

- `mysql2` needs `multipleStatements: true` in its connection or pool
  options, `migrate` fails with `Migrations need multipleStatements: true`
  otherwise
- Neon's HTTP driver runs one statement per query, migrate over its
  websocket `Pool` instead
