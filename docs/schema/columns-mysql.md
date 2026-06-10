# MySQL column types

Import from `rado/mysql`.

```ts
import {mysqlTable, int, varchar} from 'rado/mysql'
```

## Numbers

```ts
tinyint() // number
tinyint({unsigned: true})
smallint({unsigned: true}) // number
mediumint({unsigned: true}) // number
integer() / int() // number
bigint({mode: 'number'}) // number
bigint({mode: 'bigint', unsigned: true}) // bigint
float() // number
real() // number
decimal({precision: 10, scale: 2}) // string
serial() // number — bigint unsigned auto_increment
```

## Auto-increment primary keys

The usual MySQL spelling:

```ts
const User = mysqlTable('user', {
  id: serial().primaryKey()
})
```

## Text

```ts
char({length: 10}) // string
varchar({length: 255}) // string — length is required by MySQL
text() // string
tinytext() // string
mediumtext() // string
longtext() // string
```

## Booleans and binary

```ts
boolean() // boolean, stored as tinyint(1)
binary({length: 16}) // Uint8Array
varbinary({length: 256}) // Uint8Array
blob() // Uint8Array
```

## Dates and times

```ts
date({mode: 'date'}) // Date
date({mode: 'string'}) // string
datetime({mode: 'date', fsp: 3}) // Date, fractional seconds precision
time({fsp: 6}) // string
timestamp({mode: 'date'}) // Date
year() // number
```

```ts
const Post = mysqlTable('post', {
  createdAt: timestamp('created_at', {mode: 'date'}).defaultNow()
})
```

## JSON

```ts
json<T>() // typed JSON
```

```ts
const User = mysqlTable('user', {
  settings: json<{theme: 'light' | 'dark'}>()
})

await db.select().from(User).where(eq(User.settings.theme, 'dark'))
```

See [JSON](../queries/json.md) for the full story.

## MySQL quirks worth knowing

- **No `returning`** — MySQL doesn't support the `returning` clause; the
  types won't offer it. Inserts report change counts instead.
- **Upserts** use `onDuplicateKeyUpdate` rather than `onConflict*` — see
  [Insert](../queries/insert.md#upserts-mysql-style).
- **Schemas** — `mysqlSchema` is exported for organizing tables into named
  databases/schemas.
