# Schema push

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

## Pushing changes with `push`

For an existing database, `push` compares each table you pass with what's
actually in the database and applies the difference:

```ts
import {push} from 'rado/sqlite/push'

await push(db, User, Post)
```

Import it from the entry for your database:

| Database   | Import                                    |
| ---------- | ----------------------------------------- |
| SQLite     | `import {push} from 'rado/sqlite/push'`   |
| PostgreSQL | `import {push} from 'rado/postgres/push'` |
| MySQL      | `import {push} from 'rado/mysql/push'`    |
| Any        | `import {push} from 'rado/push'`          |

Each dialect entry bundles only its own planner, and refuses a database of
another dialect with `Expected a sqlite database`. `rado/push` is for
[universal databases](universal-queries.md) whose dialect is picked at
runtime: it bundles all three planners and picks one from
`db.dialect.runtime`.

What it handles:

- creating missing tables
- adding, removing, renaming and altering columns: type, nullability,
  default and identity
- adding, removing and updating primary keys, unique constraints, foreign
  keys and indexes
- on SQLite, rebuilding the table when `alter table` can't make the change
  (see below)

Push only touches the tables you pass it. It never drops other tables, and
there are no migration files, history table or down migrations.

Tables are pushed in foreign key order, so `push(db, Post, User)` creates
`User` first. Tables whose foreign keys form a cycle are refused with an error
naming them; create one side with `db.create` and add the other reference in
a second push. Temporary tables can't be pushed.

`push` lives in its own modules, so apps that never push don't ship the code
that reads and compares schemas, and apps that do only ship their dialect.
Because it's plain JavaScript talking to your driver, it runs on Node.js, Bun,
Deno and in the browser (PGlite/sql.js). Push needs a driver with
transactions: on Cloudflare D1, which has none, it fails with
`Push needs a driver with transactions` before touching the connection.

### Transactions

On SQLite and PostgreSQL everything runs inside one transaction: either the
schema ends up matching, or nothing changed. Writers are kept out while push
checks for data and applies the changes, so a row written in between can't be
lost: PostgreSQL locks each table in `share row exclusive` mode, SQLite starts
an `immediate` transaction. Readers are not blocked.

MySQL commits implicitly after every DDL statement, so there:

- a new table is created with its indexes in one `create table`, and an
  existing table's changes, renames included, go into one `alter table`.
  MySQL applies each atomically: a failure, such as a new unique index over
  duplicates, leaves that table as it was
- tables are pushed one at a time, so a failure leaves the tables before it
  pushed
- with `force`, the `update` that fills nulls with a default runs just before
  the `alter table` and stays if it fails
- MySQL can't keep writers out while push checks the data, so a column seen
  empty could fill up before the `alter table`. Dropping a column or
  narrowing its type therefore always needs `force` on MySQL, even on an
  empty table; push while writers are paused
- indexes with `where`, `nulls first`/`nulls last`, `concurrently` or `only`
  are refused before anything is created, MySQL has no equivalent
- push and `push.plan` refuse to run inside a transaction, since their DDL
  would commit it

## Dry run

`push.plan` takes the same arguments and returns the statements push would
run, without keeping any change. On SQLite and PostgreSQL it does run them,
inside a transaction it always rolls back:

```ts
const statements = await push.plan(db, User, Post)
// ['alter table "user" add column "bio" text', ...]
```

An empty array means the database already matches. On SQLite and PostgreSQL
the plan applies each table in a transaction that is rolled back, so later
tables are planned against the earlier changes, exactly as push would run
them. A table push would refuse is left unapplied, and a statement that fails
fails the plan, as it would fail the push. The plan takes the same locks as
push while it runs.

On PostgreSQL, running an expression can do what a rollback doesn't undo,
such as drawing from a sequence, directly or inside a function. So a table is
planned but not applied when its changes add a column with a default that
isn't a constant, or fill nulls with an `update`, which can also fire
triggers. Later tables are then planned against that table as it was.

MySQL can't roll back DDL, so there nothing is applied and each table is
planned against the database as it is. When one table's change affects
another, renaming a column other
tables reference for example, push may run fewer statements than the plan
shows. Planning creates a scratch table under a fresh name to read the desired
schema back, and drops only that table.

## Data loss

Push refuses a statement that would lose data and names it:

```
Push would drop column "bio" with data: alter table "user" drop column "bio"
```

It checks the rows, so these are only refused when there is data to lose:

- dropping a column that holds values
- changing a column type in a way that may not hold every value, when the
  column holds values. What counts as safe depends on the database:
  - PostgreSQL: a longer length or precision, a larger integer type, or any
    character type to `text` or `varchar`
  - MySQL: the same, with text types sized in bytes, so `varchar(1000)` to
    `tinytext` (255 bytes) is refused
  - SQLite: any change that keeps the column's
    [affinity](https://www.sqlite.org/datatype3.html#determination_of_column_affinity),
    since SQLite doesn't enforce lengths
- making a column `not null` while it holds nulls

Pass `force` to run them anyway:

```ts
await push(db, User, {force: true})
```

With `force`, a column made `not null` that has a default gets its nulls
replaced by that default first.

Some changes fail no matter what, with a short error: adding a `not null`
column without a default to a table that has rows, or a new unique or
foreign key constraint that the existing rows violate.

## Renames

Push can't tell a renamed column from a dropped one and a new one. Tell it
with a rename hint, keyed by the current `table.column` (database names) and
pointing at the new column name:

```ts
await push(db, User, {rename: {'user.name': 'full_name'}})
```

The hint renames the column in place and keeps its data. Once applied it is
a no-op, so it is safe to leave in place until every database has been
pushed. For a table in a schema, prefix the schema: `'app.user.name'`. A hint
for a table that isn't pushed, or naming a column the table doesn't define,
is an error, so a typo can't turn a rename into a drop and an add.

Renaming only the property keeps the column, since the database name is
unchanged:

```ts
// before
const T = table('t', {fieldA: varchar('field_a', {length: 10})})
// after: same column, no change
const T = table('t', {fieldB: varchar('field_a', {length: 10})})
```

## SQLite table rebuilds

SQLite's `alter table` can add, drop and rename columns, but not change a
column's type, nullability or default, or its constraints. For those, push
rebuilds the table following
[the procedure SQLite recommends](https://www.sqlite.org/lang_altertable.html#otheralter):

1. turn `foreign_keys` off if it was on, since it can't change inside a
   transaction
2. create the new table, copy the rows over with their rowids, then drop the
   old table and rename the new one. Values are copied as they are, the new
   column's affinity converts what it can without loss. An `autoincrement`
   counter keeps its high-water mark. If columns named `rowid`, `_rowid_` and
   `oid` hide the rowid, the rebuild is refused. When an existing column
   becomes an `integer primary key`, it becomes the rowid: push refuses this
   without `force` unless every row's value already equals its rowid
3. recreate the table's indexes and triggers, and every view along with the
   triggers on views, since a view may use the table
4. run `pragma foreign_key_check` on the whole database and roll back if the
   push added a violation, including one in a table that references a pushed
   table, or made a reference invalid (`foreign key mismatch`). It runs on
   every push, also when keys aren't enforced. Violations that existed before
   the push don't fail it, but a malformed foreign key anywhere in the
   database stops the check itself, so push refuses with
   `Cannot check foreign keys` and the error naming it
5. turn `foreign_keys` back on if it was on

If you call push inside your own transaction with `foreign_keys` on, it
can't turn them off, so a rebuild fails with an error instead.

## A word of warning

Push is declarative. Even with the data-loss guard, treat it accordingly:

- great for development, tests, embedded databases, local-first apps and
  small projects
- for production databases you care about, review `push.plan` first, or use
  a dedicated migration tool such as
  [dbmate](https://github.com/amacneil/dbmate) and keep rado for querying
- back up before pushing anything irreplaceable

Not covered: check constraints, generated columns, collations, enum value
changes, concurrent index builds, table renames and other database objects
such as views, sequences or policies.

## Upgrading from `db.migrate`

`db.migrate(...tables)` was replaced by `push(db, ...tables)` from
`rado/sqlite/push`, `rado/postgres/push` or `rado/mysql/push` (or `rado/push`
for universal databases). The `Database` constructor no longer takes a diff argument:
`new Database(driver, dialect, options)`. Push refuses destructive changes
that `db.migrate` ran silently; pass `{force: true}` for the old behavior.

## Running raw SQL

For hand-rolled migrations the [`sql` tag](../queries/sql.md) and `db.run`
have you covered:

```ts
await db.run(sql`alter table ${User} add column "bio" text`)
```

Combined with `db.batch` and `db.transaction`, that's enough to build your
own migration runner with versioning if you need one.
