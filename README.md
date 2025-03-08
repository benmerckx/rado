[![npm](https://img.shields.io/npm/v/rado.svg)](https://npmjs.org/package/rado)
[![jsr](https://jsr.io/badges/@rado/rado)](https://jsr.io/@rado/rado)

# rado

Fully typed, lightweight TypeScript query builder.

## Features

- Fully typed queries using TypeScript
- Composable and reusable query structures
- First-class support for JSON columns
- No code generation step required
- Zero dependencies
- Universal query support for multiple database engines

## Installation

<pre>npm install <a href="https://www.npmjs.com/package/rado">rado</a></pre>

## Quick Start

```typescript
import {table} from 'rado'
import {text, integer} from 'rado/postgres'
import {connect} from 'rado/driver/pg'
import {Pool} from 'pg'

// Define your schema
const User = table("user", {
  id: integer().primaryKey(),
  name: text().notNull(),
  email: text().unique()
})

// Connect to the database
const db = connect(new Pool({
  host: 'localhost',
  database: 'my_database'
}))

// Perform a query
const users = await db.select().from(User)
console.log(users)
```

## Supported Databases

Currently supported drivers:

| `PostgreSQL              ` | `import                      ` |
| -------------------------- | ------------------------------ |
| pg                         | rado/driver/pg                 |
| @electric-sql/pglite       | rado/driver/pglite             |
| @neondatabase/serverless   | rado/driver/pg                 |
| @vercel/postgres           | rado/driver/pg                 |

| `SQLite                  ` | `import                      ` |
| -------------------------- | ------------------------------ |
| better-sqlite3             | rado/driver/better-sqlite3     |
| bun:sqlite                 | rado/driver/bun-sqlite         |
| sql.js                     | rado/driver/sql.js             |
| @libsql/client             | rado/driver/libsql             |
| Cloudflare D1              | rado/driver/d1                 |

| `MySQL                   ` | `import                      ` |
| -------------------------- | ------------------------------ |
| mysql2                     | rado/driver/mysql2             |

Pass an instance of the database to the `connect` function to get started:

```ts
import Database from 'better-sqlite3'
import {connect} from 'rado/driver/better-sqlite3'

const db = connect(new Database('foobar.db'))
```

## Querying

### Select

Select operations allow you to retrieve data from your database.

```typescript
// Basic select
const allUsers = await db.select().from(User)

// Select specific columns
const userNames = await db.select({id: User.id, name: User.name}).from(User)
```

### Where conditions

Where conditions help you filter your query results.

```typescript
import {eq, and, or, gt, isNull} from 'rado'

// Simple equality
const john = await db.select().from(User).where(eq(User.name, 'John'))

// Complex conditions
const users = await db.select().from(User)
  .where(
    gt(User.age, 18),
    or(
      eq(User.name, 'Alice'),
      isNull(User.email)
    )
  )
```

### Joins

Joins allow you to combine data from multiple tables.

```typescript
const usersWithPosts = await db.select({
  userName: User.name,
  postTitle: Post.title,
})
.from(User)
.leftJoin(Post, eq(User.id, Post.authorId))
```

### Ordering and Grouping

You can order and group your query results:

```typescript
import {desc, asc, count} from 'rado'

const orderedUsers = await db.select()
  .from(User)
  .orderBy(asc(User.name))

const userPostCounts = await db.select({
  userName: User.name,
  postCount: count(Post.id)
})
.from(User)
.leftJoin(Post, eq(User.id, Post.authorId))
.groupBy(User.name)
```

### Pagination

Pagination helps you manage large datasets by retrieving results in smaller chunks:

```typescript
const pageSize = 10
const page = 2

const paginatedUsers = await db.select()
  .from(User)
  .limit(pageSize)
  .offset((page - 1) * pageSize)
```

### JSON columns

Rado provides first-class support for JSON columns:

```typescript
import {pgTable, serial, text, jsonb} from 'rado/postgres'

const User = pgTable("user", {
  id: serial().primaryKey(),
  name: text(),
  metadata: jsonb<{subscribed: boolean}>()
})

const subscribedUsers = await db.select()
  .from(User)
  .where(eq(User.metadata.subscribed, true))
```

### Subqueries

```typescript
const subquery = db.select({authorId: Post.authorId})
  .from(Post)
  .groupBy(Post.authorId)
  .having(gt(count(Post.id), 5))
  .as('authorIds')

const prolificAuthors = await db.select()
  .from(User)
  .where(inArray(User.id, subquery))
```

### Include

Aggregate rows using the `include` function:

```typescript
import {include} from 'rado'

const usersWithPosts = await db.select({
  ...User,
  posts: include(
    db.select().from(Post).where(eq(Post.authorId, User.id))
  )
}).from(User)

// Use include.one for a single related record
const usersWithLatestPost = await db.select({
  ...User,
  latestPost: include.one(
    db.select()
      .from(Post)
      .where(eq(Post.authorId, User.id))
      .orderBy(desc(Post.createdAt))
      .limit(1)
  )
}).from(User)
```

### SQL Operator

The `sql` operator allows you to write raw SQL and interpolate values safely:

```typescript
import {sql} from 'rado'

const minAge = 18
const adultUsers = await db.select()
  .from(User)
  .where(sql`${User.age} >= ${minAge}`)
```

## Modifying Data

### Insert

Insert operations allow you to add new records to your database:

```typescript
// Single insert
const newUser = await db.insert(User)
  .values({name: 'Alice', email: 'alice@example.com'})
  .returning()

// Bulk insert
const newUsers = await db.insert(User)
  .values([
    {name: 'Bob', email: 'bob@example.com'},
    {name: 'Charlie', email: 'charlie@example.com'},
  ])
  .returning()
```

### Update

Update operations modify existing records:

```typescript
const updatedCount = await db.update(User)
  .set({name: 'Johnny'})
  .where(eq(User.name, 'John'))
```

### Delete

Delete operations remove records from your database:

```typescript
await db.delete(User).where(eq(User.name, 'John'))
```

### Transactions

Transactions allow you to group multiple operations into a single atomic unit.

```typescript
const result = await db.transaction(async (tx) => {
  const user = await tx.insert(User)
    .values({ name: 'Alice', email: 'alice@example.com' })
    .returning()
  const post = await tx.insert(Post)
    .values({ title: 'My First Post', authorId: user.id })
    .returning()
  return {user, post}
})
```

## Universal Queries

Rado provides a universal query builder that works across different database 
engines, whether they run synchronously or asynchronously. This is useful for
writing database-agnostic code.

```typescript
import {table} from 'rado'
import {id, text} from 'rado/universal'

const User = table('user', {
  id: id(),
  name: text() 
})

const db = process.env.SQLITE ? sqliteDb : postgresDb

const userNames = await db.select(User.name).from(User)
```

## Custom Column Types

You can define custom column types, such as a boolean column that is stored as a
tinyint in the database:

```typescript
import {Column, column, table, sql} from 'rado'

export function bool(name?: string): Column<boolean | null> {
  return column({
    name,
    type: sql`tinyint(1)`,
    mapFromDriverValue(value: number): boolean {
      return value === 1
    },
    mapToDriverValue(value: boolean): number {
      return value ? 1 : 0
    }
  })
}

// Usage
const User = table('user', {
  // ...
  isActive: bool()
})
```