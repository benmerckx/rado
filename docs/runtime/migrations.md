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
alter table "user" rename column "name" to "full_name";

-- Drops column "bio"
alter table "user" drop column "bio";
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
running, and the ones after it run. The baseline is a name like the others,
so `'0001_init.sql'` and `'./migrations/0001_init.sql'` work too. It only
applies while the history is empty, so it is safe to leave in place; an
unknown name is an error.

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
shadow has no rows, so generate counts every table as holding data and
nothing is refused for it. Instead, a statement that push would refuse or
that would fail on a table with rows gets a comment above it, and there is
no `force` option:

- dropping a column: `-- Drops column "bio"`
- changing a column's type in a way that may not hold every value:
  `-- Changes column "n" from text to integer`
- making a column not null:
  `-- Makes column "name" not null over null values`. With a default, the
  nulls are filled with it first
- adding a not null column without a default:
  `-- Adds not null column "extra" without a default`
- adding a primary key, unique key or foreign key to an existing table:
  `-- Adds unique key "code_key", fails on duplicates`,
  `-- Adds foreign key "author", fails on rows without a match`

Tables in the shadow's own schema, `public` on PGlite, are written without a
schema, and so are serial sequences. Such a file applies to the first schema
in the `search_path` of the database it runs on. Tables in another schema
keep theirs. Push and generate create a schema that doesn't exist yet, for a
new table or an enum, with `create schema if not exists`, so a table in a new
`pgSchema` needs no hand-written `create schema` and the file still runs
where the schema exists. On MySQL the database name is left out the same
way.

On SQLite a change `alter table` can't make rebuilds the table, see
[SQLite table rebuilds](push.md#sqlite-table-rebuilds). A generated rebuild
starts with `pragma defer_foreign_keys = on`, so where foreign keys can't be
turned off, references are checked at commit instead of failing the drop.
Its comment sits above the `insert` that copies the rows, and views and
triggers are dropped and recreated as SQLite stored them, which can span
several lines.

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
  run. Statements that can't run in a transaction, such as
  `create index concurrently`, can't be part of a migration.
- SQLite: one `immediate` transaction for the whole run, with the same
  rollback. A rebuilt table is dropped and recreated, and with foreign keys
  on, dropping it would cascade to the rows that reference it. The
  `foreign_keys` pragma does nothing inside a transaction, so `migrate` turns
  it off around the run, as SQLite's own rebuild procedure does, and fails
  with `Migrations would violate foreign key constraints` before commit if
  the run broke a reference. Where keys stay on anyway, inside your own
  transaction, `migrate` refuses with
  `Cannot migrate with foreign keys enforced`: run it outside, or turn keys
  off first. libsql runs a transaction on a connection of its own, where the
  pragma of the client's connection doesn't apply: keys there follow that
  connection's default, and when they are on `migrate` refuses the same way.
  That is how the code handles it; it was tested on a local database, not
  against a remote server. With nothing pending `migrate` returns before
  any of this, so it doesn't scan the keys at every start. A waiting process
  needs a busy timeout to wait at all:
  bun:sqlite's default is 0, so set `pragma busy_timeout = 5000` or similar
  when processes may migrate at the same time.
- MySQL commits implicitly after each DDL statement, so a run can't be rolled
  back. It holds a lock named after the database, `get_lock`, on one
  connection and records each file right after it succeeds. A failing file
  stops the run with `Migration 0003_x failed and may be partially applied`:
  the statements before the failing one stay, so fix the database or the
  file by hand. Inside your own MySQL transaction `migrate` refuses with
  `Cannot migrate inside a MySQL transaction`.
- Drivers without transactions, such as Cloudflare D1, run the files in
  order without a lock, recording each after it succeeds. Make sure only one
  process migrates at a time. D1 runs each line of a script as one
  statement, so rado puts every statement on a line of its own: comments go
  and line breaks outside string literals become spaces, with LF or CRLF
  line endings. A trigger body stays one statement. A line break inside a
  string literal can't be kept on D1, write it as `char(10)` there. A
  failing file's error includes the reason D1 gives.
- Cloudflare D1 and Durable Objects always enforce foreign keys, so turning
  them off doesn't take, and `migrate` runs anyway. There, rebuilding a
  table that another table references with `on delete cascade` deletes the
  referencing rows, deferred keys or not. Push refuses such a rebuild, and
  `migrate` runs it, so review a generated one before running it there.

Some drivers can't send several statements in one call:

- `mysql2` needs `multipleStatements: true` in its connection or pool
  options, `migrate` fails with `Migrations need multipleStatements: true`
  otherwise
- Neon's HTTP driver runs one statement per query, migrate over its
  websocket `Pool` instead
