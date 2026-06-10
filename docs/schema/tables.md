# Tables

A table in rado is a plain value: a name plus an object of columns. Define it
once and use it everywhere: in queries, in `db.create`, in `db.migrate`, in
type inference.

## Defining a table

```ts
import {table} from 'rado'
import {integer, text} from 'rado/sqlite'

const User = table('user', {
  id: integer().primaryKey({autoIncrement: true}),
  name: text().notNull(),
  email: text().unique()
})
```

The generic `table` export works with column types of any dialect. Each
dialect module also exports a typed wrapper that pins queries to that dialect:

```ts
import {sqliteTable} from 'rado/sqlite'
import {pgTable} from 'rado/postgres'
import {mysqlTable} from 'rado/mysql'
```

Use the wrapper of your database for best-fitting types, or stay generic with
`table` + `rado/universal` columns if a query should run anywhere.

## Column names are inferred

The property name becomes the column name. Only pass a name when they differ:

```ts
const User = table('user', {
  id: integer().primaryKey(), // column "id"
  createdAt: integer('created_at') // column "created_at", property createdAt
})
```

## Column modifiers

Modifiers chain off any column type, and each one refines the TypeScript type
of the column:

```ts
text() // string | null
text().notNull() // string
text().default('hello') // string | null, optional on insert
text().notNull().default('hi') // string, optional on insert
integer().primaryKey() // number, non-null, optional if auto-generated
```

### `notNull()`

Adds `not null`. Removes `null` from the select type and makes the column
required on insert (unless it has a default).

### `default(value)` / `defaultNow()`

A database-side default. Accepts a value or SQL expression:

```ts
import {sql} from 'rado'

const Post = table('post', {
  status: text().notNull().default('draft'),
  createdAt: timestamp().defaultNow(),
  token: text().default(sql`gen_random_uuid()`)
})
```

### `$default(fn)` / `$defaultFn(fn)`

A runtime default is computed in JavaScript at insert time. The database never
knows:

```ts
const Post = table('post', {
  id: text()
    .primaryKey()
    .$default(() => crypto.randomUUID())
})
```

### `$onUpdate(fn)` / `$onUpdateFn(fn)`

A runtime value applied on every `update` (and insert if no default is set):

```ts
const Post = table('post', {
  updatedAt: integer('updated_at', {mode: 'timestamp'}).$onUpdate(
    () => new Date()
  )
})
```

### `primaryKey(options?)`

Marks the column as primary key. On SQLite you can request rowid
auto-increment behavior:

```ts
id: integer().primaryKey({autoIncrement: true})
```

PostgreSQL users probably want identity columns instead. See
[PostgreSQL column types](columns-postgres.md#serial-and-identity-columns).

### `unique(name?)`

A column-level unique constraint, optionally named. PostgreSQL additionally
supports `unique(name, {nulls: 'not distinct'})`.

### `references(() => column, options?)`

A column-level foreign key:

```ts
const Post = table('post', {
  authorId: integer()
    .notNull()
    .references(() => User.id, {onDelete: 'cascade'})
})
```

`onDelete` and `onUpdate` accept the usual actions: `'cascade'`,
`'restrict'`, `'set null'`, `'set default'`, `'no action'`.

For composite or named foreign keys, use the table-level `foreignKey` helper.
See [Indexes & constraints](indexes-and-constraints.md).

### `$type<T>()`

Narrows the TypeScript type without changing the SQL type. Use it for branded
IDs or string unions:

```ts
type UserId = number & {brand: 'UserId'}

const User = table('user', {
  id: integer().primaryKey().$type<UserId>()
})
```

## Table-level configuration

Pass a callback as the third argument to declare composite constraints and
indexes. It receives the table itself:

```ts
import {index, primaryKey, table, unique} from 'rado'

const Membership = table(
  'membership',
  {
    userId: integer().notNull(),
    groupId: integer().notNull(),
    role: text().notNull()
  },
  self => ({
    pk: primaryKey(self.userId, self.groupId),
    uniqueRole: unique().on(self.userId, self.role),
    groupIndex: index().on(self.groupId)
  })
)
```

Full reference in [Indexes & constraints](indexes-and-constraints.md).

## Aliasing tables

Self-joins need two names for the same table. `alias` creates a renamed
reference:

```ts
import {alias, eq} from 'rado'

const Manager = alias(User, 'manager')

const pairs = await db
  .select({employee: User.name, manager: Manager.name})
  .from(User)
  .leftJoin(Manager, eq(User.managerId, Manager.id))
```

## Reusable name mapping with `tableCreator`

If every table in your database carries a prefix, wrap the naming logic once:

```ts
import {tableCreator} from 'rado'

const appTable = tableCreator(name => `myapp_${name}`)

const User = appTable('user', {...}) // creates table "myapp_user"
```

Dialect-typed versions exist too: `sqliteTableCreator`, `pgTableCreator`,
`mysqlTableCreator`.

## Inferring row types

The table's TypeScript types are available for free:

```ts
import type {InferInsertModel, InferSelectModel} from 'rado'

type User = InferSelectModel<typeof User>
// {id: number; name: string; email: string | null}

type NewUser = InferInsertModel<typeof User>
// {id?: number; name: string; email?: string | null}
```

These are aliases for rado's own `SelectRow` and `InsertRow` types.

## Next

- Pick your column types: [SQLite](columns-sqlite.md),
  [PostgreSQL](columns-postgres.md), [MySQL](columns-mysql.md),
  [universal](columns-universal.md)
- [Indexes & constraints](indexes-and-constraints.md)
- [Custom column types](custom-types.md)
