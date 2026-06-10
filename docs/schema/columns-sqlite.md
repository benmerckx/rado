# SQLite column types

Import from `rado/sqlite`. SQLite famously has only a handful of storage
classes, so rado's SQLite columns lean on _modes_ to map them to useful
JavaScript types.

```ts
import {sqliteTable, integer, text} from 'rado/sqlite'
```

## `integer` / `int`

```ts
integer() // number
integer('renamed') // explicit column name
integer({mode: 'number'}) // number (explicit)
integer({mode: 'boolean'}) // boolean, stored as 0/1
integer({mode: 'timestamp'}) // Date, stored as unix seconds
integer({mode: 'timestamp_ms'}) // Date, stored as unix milliseconds
```

The timestamp modes convert to and from `Date` automatically:

```ts
const Post = sqliteTable('post', {
  createdAt: integer('created_at', {mode: 'timestamp'}).defaultNow()
})

await db.insert(Post).values({createdAt: new Date()})
const [post] = await db.select().from(Post)
post.createdAt // Date
```

`int` is an alias for `integer`.

## `text`

```ts
text() // string
text({length: 255}) // text(255)
text({enum: ['draft', 'published']}) // 'draft' | 'published'
text<Settings>({mode: 'json'}) // typed JSON stored as text
```

The `enum` option is purely a TypeScript constraint — SQLite stores plain
text. The `json` mode serializes on write and parses on read, and supports
[typed JSON field access](../queries/json.md).

## `boolean`

```ts
boolean() // boolean, stored as integer 0/1
```

## `real` and `numeric`

```ts
real() // number, floating point
numeric() // number
```

## `blob`

```ts
blob() // Uint8Array
blob({mode: 'buffer'}) // ArrayBuffer
blob({mode: 'bigint'}) // bigint, stored as text in a blob
blob<T>({mode: 'json'}) // typed JSON
```

## `json` and `jsonb`

```ts
json<T>() // typed JSON stored as text
jsonb<T>() // typed JSON stored in SQLite's binary jsonb format
```

Both give you typed property access in queries:

```ts
const User = sqliteTable('user', {
  id: integer().primaryKey(),
  settings: json<{theme: 'light' | 'dark'}>()
})

await db.select().from(User).where(eq(User.settings.theme, 'dark'))
```

See [JSON](../queries/json.md) for everything you can do with these.

## Auto-incrementing primary keys

```ts
const User = sqliteTable('user', {
  id: integer().primaryKey({autoIncrement: true})
})
```

Note that in SQLite an `integer primary key` is already an alias for the rowid
and will auto-assign values; `autoIncrement` adds the stricter `autoincrement`
keyword.

## SQLite-specific functions

`rado/sqlite` also exports a set of SQLite functions usable in queries —
including `iif`, full-text search helpers (`bm25`, `highlight`, `snippet`) and
the JSON function family. Use them like any expression:

```ts
import {iif} from 'rado/sqlite'

await db.select({label: iif(eq(User.id, 1), 'first', 'other')}).from(User)
```

For anything not exported, the generic `Functions` proxy or the
[`sql` tag](../queries/sql.md) has you covered.
