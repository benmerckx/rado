# Universal column types

Import from `rado/universal`. These columns emit the right SQL type for
whatever database the query lands on, letting you define one schema that runs
on SQLite, PostgreSQL and MySQL. The database is chosen at runtime.

```ts
import {table} from 'rado'
import {boolean, id, integer, json, text} from 'rado/universal'

const User = table('user', {
  id: id(),
  name: text().notNull(),
  active: boolean(),
  settings: json<{theme: string}>()
})
```

## Available types

| Column              | JavaScript type | SQLite            | PostgreSQL                             | MySQL                         |
| ------------------- | --------------- | ----------------- | -------------------------------------- | ----------------------------- |
| `id()`              | `number`        | `integer` (rowid) | `integer generated always as identity` | `int not null auto_increment` |
| `text()`            | `string`        | `text`            | `text`                                 | `text`                        |
| `varchar({length})` | `string`        | `varchar(n)`      | `varchar(n)`                           | `varchar(n)`                  |
| `integer()`         | `number`        | `integer`         | `integer`                              | `integer`                     |
| `number()`          | `number`        | `numeric`         | `numeric`                              | `double`                      |
| `boolean()`         | `boolean`       | `integer` 0/1     | `boolean`                              | `tinyint(1)`                  |
| `json<T>()`         | `T`             | `text`            | `json`                                 | `json`                        |
| `jsonb<T>()`        | `T`             | `jsonb`           | `jsonb`                                | `json`                        |
| `blob()`            | `Uint8Array`    | `blob`            | `bytea`                                | `blob`                        |

`id()` creates an auto-incrementing, non-null primary key on every dialect,
with the boilerplate spelled correctly for each.

## How it works

Universal columns are built on `sql.universal`, which carries a different SQL
fragment per dialect and picks the right one when the query is emitted:

```ts
sql.universal({
  sqlite: sql`integer`,
  postgres: sql`integer generated always as identity`,
  mysql: sql`int not null auto_increment`
})
```

You can use the same mechanism for your own
[custom column types](custom-types.md) or even inside queries. See
[The sql tag](../queries/sql.md#per-dialect-sql-with-sqluniversal).

## Universal functions and transactions

`rado/universal` also exports a small set of cross-dialect SQL functions and
transaction helpers used by rado internally and available to you. When you
need something dialect-specific, drop down to the dialect module or the
[`sql` tag](../queries/sql.md).

## When to use universal columns

- Libraries that ship with embedded database support but let users bring
  their own database (this is why rado exists; [Alinea](https://alineacms.com)
  needed it)
- Test suites that run the same logic against multiple engines
- Apps that start on SQLite and want a believable Postgres exit strategy

For the full pattern of defining once and connecting differently per
environment, see [Universal queries](../runtime/universal-queries.md).
