# Indexes & constraints

Single-column constraints usually live on the column itself
(`.primaryKey()`, `.unique()`, `.references()` — see
[Tables](tables.md#column-modifiers)). For anything composite or named, pass a
config callback as the third argument of `table`. It receives the table and
returns an object of constraints and indexes:

```ts
import {foreignKey, index, primaryKey, table, unique, uniqueIndex} from 'rado'

const Membership = table(
  'membership',
  {
    userId: integer().notNull(),
    groupId: integer().notNull(),
    nickname: text()
  },
  self => ({
    pk: primaryKey(self.userId, self.groupId),
    uniqueNickname: unique().on(self.groupId, self.nickname),
    byGroup: index().on(self.groupId),
    userRef: foreignKey(self.userId).references(User.id)
  })
)
```

The object keys (`pk`, `uniqueNickname`, ...) become the constraint/index
names unless a name is given explicitly.

## Primary keys

```ts
// Composite primary key
primaryKey(self.userId, self.groupId)

// Or with an explicit name
primaryKey({name: 'membership_pk', columns: [self.userId, self.groupId]})
```

## Unique constraints

```ts
unique().on(self.email)
unique('unique_email').on(self.email)
unique().on(self.groupId, self.nickname)

// PostgreSQL: treat nulls as equal
unique().on(self.email).nullsNotDistinct()
```

## Foreign keys

Column-level `.references()` covers the common case. The table-level helper
handles composite keys and explicit naming:

```ts
foreignKey(self.userId).references(User.id)

foreignKey({
  name: 'order_line_fk',
  columns: [self.orderId, self.lineNumber],
  foreignColumns: [OrderLine.orderId, OrderLine.number]
})
```

## Indexes

```ts
index().on(self.groupId)
uniqueIndex().on(self.email)

// Composite, with per-column ordering
index().on(self.lastName, self.firstName)
```

Index builders support a fluent set of options (apply what your database
understands):

```ts
index()
  .on(self.title)
  .using(sql`gin`) // index method (postgres)
  .concurrently() // create index concurrently (postgres)
  .where(isNotNull(self.title)) // partial index
```

Ordering helpers `asc()`, `desc()`, `nullsFirst()`, `nullsLast()` are also
available on the builder.

## When do they apply?

Constraints and indexes are emitted by `db.create(Table)` and kept up to date
by `db.migrate(Table)` — the migration diff adds, drops and recreates indexes
and constraints to match your definition. See
[Migrations](../runtime/migrations.md).
