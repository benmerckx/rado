# Inspect

`inspect` reads the schema of a database back: its tables with their
columns, keys, indexes and foreign keys, and its views.

```ts
import {inspect} from 'rado/sqlite/inspect'

const {tables, views} = await inspect(db)
```

Import it from the entry for your database:

| Database   | Import                                          |
| ---------- | ----------------------------------------------- |
| SQLite     | `import {inspect} from 'rado/sqlite/inspect'`   |
| PostgreSQL | `import {inspect} from 'rado/postgres/inspect'` |
| MySQL      | `import {inspect} from 'rado/mysql/inspect'`    |
| Any        | `import {inspect} from 'rado/inspect'`          |

A dialect entry only accepts a database of its dialect, also at the type
level, and refuses another with `Expected a sqlite database`. `rado/inspect`
is for [universal databases](universal-queries.md): it bundles all three and
picks one from `db.dialect.runtime`.

Like queries, `inspect` returns the schema directly on a synchronous driver
(bun:sqlite, better-sqlite3, node:sqlite, sql.js) and a promise on an
asynchronous one, so `await` works for both.

## Which schema

`inspect` reads one schema: the current one on PostgreSQL
(`current_schema()`) and MySQL (`database()`), and `main` on SQLite. Pass
another as an option:

```ts
const archive = await inspect(db, {schema: 'archive'})
```

## The result

The values are the database's own text, as it prints them, not normalized
for comparison: a type reads `character varying(20)` on PostgreSQL and
`varchar(20)` on MySQL, a default `'x'::text` on PostgreSQL.

```ts
interface Schema {
  tables: Array<Table>
  views: Array<View>
}

interface Table {
  schema: string
  name: string
  columns: Array<Column>
  primaryKey?: Constraint
  uniques: Array<Constraint & {name: string}>
  indexes: Array<Index>
  foreignKeys: Array<ForeignKey>
}

interface Column {
  name: string
  type: string // as the database prints it
  notNull: boolean
  default: string | null // sql expression text
  autoIncrement: boolean // autoincrement, auto_increment, serial or identity
}

interface Constraint {
  name?: string
  columns: Array<string>
  definition?: string // as the database prints it, on PostgreSQL
}

interface Index {
  name: string
  unique: boolean
  columns: Array<string> // column names, or expression text
  where?: string // the predicate of a partial index
  definition: string // the full create statement
}

interface ForeignKey {
  name?: string
  columns: Array<string>
  schema: string
  table: string
  references: Array<string>
  onDelete: string // for example CASCADE or NO ACTION
  onUpdate: string
}

interface View {
  schema: string
  name: string
  definition: string
}
```

Differences between the databases:

- SQLite doesn't keep the names of primary keys, unique constraints and
  foreign keys, so those come without one, and uniques are named after the
  index SQLite made for them. A foreign key that names no columns references
  the primary key, its `references` then hold empty strings
- MySQL makes no difference between a unique constraint and a unique index:
  both are listed in `indexes`, and `uniques` stays empty. Its index
  `definition` is put together from the catalog, MySQL doesn't keep the
  statement. A literal default is quoted into SQL text, an expression default
  is shown as MySQL stores it
- PostgreSQL reads with the schema first in the search path, so names in that
  schema print without it

Checks, enums, sequences, triggers and comments aren't read yet.

## Push reads the same catalog

[Push](push.md) uses the same catalog queries to read the tables it pushes,
so what `inspect` shows is what push compares, before push normalizes it.
