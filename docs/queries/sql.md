# The sql tag

The `sql` template tag is the escape hatch for everything the builder doesn't
cover — written safely, with automatic parameterization and full participation
in the type system.

```ts
import {sql} from 'rado'

const minAge = 18
const adults = await db
  .select()
  .from(User)
  .where(sql`${User.age} >= ${minAge}`)
```

Interpolated values become bound parameters — never string concatenation, no
SQL injection. Interpolated columns, tables and other rado expressions are
embedded as proper identifiers and SQL.

## Typing sql expressions

Give the tag a generic to type the result:

```ts
const nameLength = sql<number>`length(${User.name})`

const rows = await db.select({name: User.name, len: nameLength}).from(User)
// Array<{name: string, len: number}>
```

A `sql<boolean>` expression is accepted anywhere a condition goes.

## What can be interpolated

```ts
sql`${User.name}`        // a column → quoted identifier
sql`${User}`             // a table → quoted (qualified) name
sql`${someValue}`        // a value → bound parameter
sql`${otherSqlExpr}`     // another sql fragment → inlined
sql`${db.select(...).from(...)}` // a query → parenthesized subquery
```

## Aliasing and mapping

```ts
// Alias for the selection
sql<string>`upper(${User.name})`.as('upper_name')

// Convert the driver value on read
const [average] = await db.select(avg(Post.views).mapWith(Number)).from(Post)
// number | null instead of string | null
```

`mapWith` accepts a function or anything with `mapFromDriverValue` — handy for
dates, bigints or custom decoders.

## Building blocks in the `sql` namespace

### `sql.identifier(name)`

Quote a dynamic identifier safely:

```ts
await db.run(sql`drop type if exists ${sql.identifier(typeName)}`)
```

### `sql.value(v)` and `sql.inline(v)`

`sql.value` creates a bound parameter explicitly; `sql.inline` writes the
value literally into the SQL (use for constants only):

```ts
sql`${sql.inline(100)}` // → 100 in the SQL text, no parameter
```

### `sql.placeholder(name)`

A named parameter, filled in at execution time — the backbone of
[prepared statements](../runtime/prepared-statements.md):

```ts
const byName = db
  .select()
  .from(User)
  .where(eq(User.name, sql.placeholder('name')))
  .prepare('byName')

const ada = await byName.execute({name: 'Ada'})
```

### `sql.join(items, separator?)`

Combine fragments with a separator:

```ts
const orderColumns = sql.join([User.name, User.id], sql`, `)
```

### `sql.empty()`

A zero-length fragment, useful as a fold seed or optional piece.

### `sql.universal({...})`

Different SQL per dialect, chosen when the query is emitted:

```ts
const nowExpr = sql.universal({
  sqlite: sql`unixepoch()`,
  postgres: sql`extract(epoch from now())::int`,
  mysql: sql`unix_timestamp()`
})
```

This is how [universal columns](../schema/columns-universal.md) are
implemented — and yours to use anywhere.

### `sql.unsafe(string)`

Embeds a string as raw SQL, no quoting, no parameterization:

```ts
await db.run(sql.unsafe('vacuum'))
```

The name is the documentation: never feed it user input.

## Running raw statements

The database itself executes plain SQL:

```ts
await db.run(sql`pragma journal_mode = wal`)
const value = await db.get(sql<number>`select 42`)
const rows = await db.all(sql<string>`select name from sqlite_master`)
await db.execute(sql`refresh materialized view stats`) // no parameters allowed
```

## Conditional fragments with `.if()`

Include a fragment only when a condition holds:

```ts
sql`select * from logs ${sql`where level >= 3`.if(onlyImportant)}`
```
