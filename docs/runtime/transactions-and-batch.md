# Transactions & batch

Group statements so they succeed or fail together.

## Transactions

```ts
const result = await db.transaction(async tx => {
  const [user] = await tx
    .insert(User)
    .values({name: 'Ada'})
    .returning()

  await tx.insert(Post).values({
    authorId: user.id,
    title: 'First post'
  })

  return user
})
```

The callback receives a transaction `tx` with the full database API. If the
callback throws, everything rolls back; if it returns, everything commits and
the return value is yours.

On synchronous drivers the callback is synchronous too — no `await`:

```ts
const result = db.transaction(tx => {
  const [user] = tx.insert(User).values({name: 'Ada'}).returning()
  tx.insert(Post).values({authorId: user.id, title: 'First post'}).run()
  return user
})
```

## Rolling back deliberately

`tx.rollback()` aborts the transaction by throwing. Pass a value to get it
back out:

```ts
import {Rollback} from 'rado'

try {
  await db.transaction(async tx => {
    const [user] = await tx.insert(User).values({name: 'Ada'}).returning()
    const ok = await someBusinessCheck(user)
    if (!ok) tx.rollback({reason: 'check failed'})
  })
} catch (err) {
  if (err instanceof Rollback) {
    err.data // {reason: 'check failed'}
  } else {
    throw err
  }
}
```

(`Rollback` is also exported as `TransactionRollbackError`.)

## Nested transactions

Transactions nest via savepoints — an inner failure rolls back to the
savepoint without dooming the outer transaction:

```ts
await db.transaction(async tx => {
  await tx.insert(User).values({name: 'Ada'})

  try {
    await tx.transaction(async inner => {
      await inner.insert(Post).values({authorId: 1, title: 'risky'})
      inner.rollback()
    })
  } catch {
    // inner rolled back; Ada's insert survives
  }
})
```

## Transaction options

Dialect-specific options are passed as the second argument — for example on
PostgreSQL:

```ts
await db.transaction(
  async tx => {...},
  {isolationLevel: 'serializable', accessMode: 'read write'}
)
```

## Batch

`db.batch` runs an array of queries in one transaction (and, where the driver
supports it, a single round-trip). Results come back per query:

```ts
const [users, , posts] = await db.batch([
  db.select().from(User),
  db.insert(User).values({name: 'Ada'}),
  db.select().from(Post)
])
```

On Cloudflare D1 — which has no interactive transactions — `batch` is *the*
way to get atomicity, mapping directly onto D1's native batch API.

## Creating and dropping in bulk

`db.create` and `db.drop` accept any number of tables, views, schemas and
enums, and run as a batch:

```ts
await db.create(appSchema, User, Post, ActiveUsers)
await db.drop(ActiveUsers, Post, User)
```
