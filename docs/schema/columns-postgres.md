# PostgreSQL column types

Import from `rado/postgres`. Postgres has a famously rich type catalog and
rado covers a generous slice of it, including identity columns, arrays and
pgvector types.

```ts
import {pgTable, integer, text, timestamp} from 'rado/postgres'
```

## Numbers

```ts
smallint()                       // number
integer() / int()                // number
bigint({mode: 'number'})         // number
bigint({mode: 'bigint'})         // bigint
doublePrecision()                // number
real()                           // number
numeric()                        // string (exact, arbitrary precision)
numeric({mode: 'number'})        // number
numeric({mode: 'bigint'})        // bigint
numeric({precision: 10, scale: 2})
oid()                            // number
```

`numeric` defaults to `string` so you never silently lose precision. Opt into
`number` or `bigint` when you know your values fit.

## Serial and identity columns

```ts
smallserial()  // number
serial()       // number
bigserial({mode: 'number' | 'bigint'})
```

Postgres itself recommends identity columns over serials these days, and rado
supports them as modifiers on any integer-ish column:

```ts
const User = pgTable('user', {
  id: integer().primaryKey().generatedAlwaysAsIdentity()
  // or .generatedByDefaultAsIdentity()
})
```

## Text

```ts
text()                  // string
varchar({length: 255})  // string
char({length: 10})      // string
```

## Booleans, binary, UUID

```ts
boolean() // boolean
bytea()   // Uint8Array
uuid()    // string
```

```ts
const Session = pgTable('session', {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`)
})
```

## Dates and times

```ts
date({mode: 'date'})      // Date
date({mode: 'string'})    // string
time({precision: 6, withTimeZone: true})  // string
timestamp({mode: 'date'}) // Date
timestamp({mode: 'string', precision: 3, withTimeZone: true})
interval({fields: 'day to hour', precision: 6}) // string
```

```ts
const Post = pgTable('post', {
  createdAt: timestamp('created_at', {mode: 'date'}).defaultNow()
})
```

## JSON

```ts
json<T>()  // typed JSON
jsonb<T>() // typed JSON, binary storage (you usually want this one)
```

```ts
const User = pgTable('user', {
  settings: jsonb<{theme: 'light' | 'dark'}>()
})

await db.select().from(User).where(eq(User.settings.theme, 'dark'))
```

See [JSON](../queries/json.md).

## Arrays

Every Postgres column can become an array with `.array(size?)`:

```ts
const Post = pgTable('post', {
  tags: text().array(),          // string[]
  matrix: integer().array().array() // number[][] — yes, it nests
})
```

Filter with the array operators:

```ts
import {arrayContains, arrayOverlaps} from 'rado'

await db.select().from(Post).where(arrayContains(Post.tags, ['sql']))
await db.select().from(Post).where(arrayOverlaps(Post.tags, ['sql', 'ts']))
```

## Network and bit types

```ts
inet()     // string
cidr()     // string
macaddr()  // string
macaddr8() // string
bit({dimensions: 3})   // string
varbit({dimensions: 8}) // string
```

## Geometry

```ts
point({mode: 'tuple'}) // [x, y]
point({mode: 'xy'})    // {x, y}
line({mode: 'tuple'})  // [a, b, c]
line({mode: 'abc'})    // {a, b, c}
geometry({type: 'point', mode: 'xy'}) // PostGIS geometry
```

## pgvector

For similarity search with the [pgvector](https://github.com/pgvector/pgvector)
extension:

```ts
vector({dimensions: 1536})    // number[]
halfvec({dimensions: 1536})   // number[]
sparsevec({dimensions: 1536}) // string
```

## Enums

Postgres enums are declared with `pgEnum` and used as column types — they get
their own page: [PostgreSQL schemas & enums](postgres-schemas-and-enums.md).

```ts
import {pgEnum, pgTable} from 'rado/postgres'

const mood = pgEnum('mood', ['sad', 'ok', 'happy'])

const MoodEntry = pgTable('mood_entry', {
  state: mood().notNull() // 'sad' | 'ok' | 'happy'
})
```

## Postgres-specific column modifiers

On top of the [shared modifiers](tables.md#column-modifiers), `PgColumn` adds:

- `.array(size?)` — see above
- `.generatedAlwaysAsIdentity()` / `.generatedByDefaultAsIdentity()`
- `.unique(name?, {nulls: 'not distinct'})` — treat nulls as equal in the
  unique constraint
