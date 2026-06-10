# JSON

JSON columns in rado aren't opaque blobs — they're typed structures you can
reach into, select from and filter on with plain property access.

## Defining a typed JSON column

Pass the type as a generic to a JSON-capable column:

```ts
import {jsonb, pgTable, serial, text} from 'rado/postgres'

interface Settings {
  theme: 'light' | 'dark'
  notifications: boolean
  tags: Array<string>
}

const User = pgTable('user', {
  id: serial().primaryKey(),
  name: text(),
  settings: jsonb<Settings>()
})
```

Every dialect has JSON columns: `json`/`jsonb` on PostgreSQL and SQLite,
`json` on MySQL, plus SQLite's `text({mode: 'json'})` and
`blob({mode: 'json'})`. The universal `json`/`jsonb` columns work everywhere.

## Property access in queries

A JSON column's fields are accessible as typed expressions — just keep dotting:

```ts
import {eq} from 'rado'

// In a where
const dark = await db.select().from(User).where(eq(User.settings.theme, 'dark'))

// In a selection
const themes = await db.select(User.settings.theme).from(User)
// Array<'light' | 'dark'>

// Array elements by index
const firstTag = await db.select(User.settings.tags[0]).from(User)
```

TypeScript knows the shape: `User.settings.thmee` is a compile error, and
`eq(User.settings.notifications, 'yes')` won't fly either. The access compiles
to the right operator per dialect (`->`/`->>` and friends).

## Inserting and updating JSON

JSON values are passed as plain objects and serialized for you:

```ts
await db.insert(User).values({
  name: 'Ada',
  settings: {theme: 'dark', notifications: true, tags: ['pioneer']}
})

await db
  .update(User)
  .set({settings: {theme: 'light', notifications: false, tags: []}})
  .where(eq(User.id, 1))
```

## Aggregating to JSON

Collect values into JSON arrays in a grouped query:

```ts
import {jsonAggregateArray} from 'rado'

const tagsPerAuthor = await db
  .select({
    authorId: Post.authorId,
    titles: jsonAggregateArray(Post.title)
  })
  .from(Post)
  .groupBy(Post.authorId)
```

Or build a JSON array from expressions in a single row:

```ts
import {jsonArray} from 'rado'

await db.select(jsonArray(User.id, User.name)).from(User)
```

For fetching related rows as nested JSON, [Include](include.md) wraps all of
this up for you.

## Notes per dialect

- **PostgreSQL** — prefer `jsonb` over `json` for indexing and operators
- **SQLite** — JSON is stored as text (or jsonb); rado parses results
  transparently. JSON functions like `json_extract` are available via
  `rado/sqlite` exports or the `Functions` proxy
- **MySQL** — the native `json` type is used; results are parsed by the
  driver
