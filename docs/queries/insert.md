# Insert

Add rows with `db.insert(Table).values(...)`, with full type checking of what
goes in — and, where the database supports it, `returning` for what comes
back.

## Inserting rows

```ts
// One row
await db.insert(User).values({name: 'Ada', email: 'ada@example.com'})

// Several rows
await db.insert(User).values([
  {name: 'Grace', email: 'grace@example.com'},
  {name: 'Margaret', email: 'margaret@example.com'}
])
```

The values object is typed from the table definition:

- `.notNull()` columns without a default are **required**
- columns with `.default(...)`, `.$default(...)` or generated values are
  optional
- nullable columns are optional
- unknown keys are a type error

Columns you omit fall back to their database or runtime defaults.

## Returning inserted rows (PostgreSQL/SQLite)

```ts
// The full row, including generated ids and defaults
const [user] = await db.insert(User).values({name: 'Ada'}).returning()

// Or a specific selection
const [id] = await db.insert(User).values({name: 'Ada'}).returning(User.id)
```

`returning()` without arguments returns complete rows; pass a field or
selection object to shape the result. MySQL doesn't support `returning` — the
types won't offer it there.

## SQL expressions as values

Values aren't limited to literals:

```ts
import {sql} from 'rado'

await db.insert(User).values({
  name: sql`upper(${'ada'})`
})
```

## Upserts (PostgreSQL/SQLite)

### Do nothing on conflict

```ts
await db.insert(User).values({id: 1, name: 'Ada'}).onConflictDoNothing()

// Or scoped to a specific conflict target
await db
  .insert(User)
  .values({id: 1, name: 'Ada'})
  .onConflictDoNothing({target: User.id})
```

### Update on conflict

```ts
await db
  .insert(User)
  .values({id: 1, name: 'Ada Lovelace'})
  .onConflictDoUpdate({
    target: User.id,
    set: {name: 'Ada Lovelace'}
  })
```

Options:

- `target` — the conflicting column(s); pass an array for composite targets
- `targetWhere` — condition on the conflict target (partial indexes)
- `set` — the columns to update
- `setWhere` — only perform the update when this condition holds

## Upserts, MySQL style

MySQL spells it differently:

```ts
await db
  .insert(User)
  .values({id: 1, name: 'Ada Lovelace'})
  .onDuplicateKeyUpdate({set: {name: 'Ada Lovelace'}})
```

## Insert from select

Copy rows from a query instead of literal values. The selection's fields must
match the table's columns:

```ts
const archived = db
  .select({id: Post.id, authorId: Post.authorId, title: Post.title})
  .from(Post)
  .where(eq(Post.published, false))

await db.insert(PostArchive).select(archived)
```

## Overriding identity columns (PostgreSQL)

Inserting explicit values into a `generated always as identity` column
requires an override:

```ts
await db
  .insert(User)
  .overridingSystemValue()
  .values({id: 9000, name: 'Imported'})
```
