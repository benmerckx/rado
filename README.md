[![npm](https://img.shields.io/npm/v/rado.svg)](https://npmjs.org/package/rado)

# rado

Fully typed, lightweight TypeScript query builder.

- Definition via TypeScript types
- Composable queries
- First class JSON columns
- No code generation step
- No dependencies

<pre>npm install <a href="https://www.npmjs.com/package/rado">rado</a></pre>

## Queries

#### Where

Conditions can be created by accessing the fields of the table:

```ts
import {eq} from 'rado'
eq(User.id, 1) // Compare with a value
eq(User.id, Post.userId) // Compare to fields on other tables
```

Rows can be selected by passing the condition in the where method:

```ts
import {eq, or, gt, lt} from 'rado'
db.select().from(User).where(eq(User.id, 1))
// Conditions can be as complex as you want
db.select().from(User).where(or(gt(User.id, 1), lt(User.id, 5)))
```

#### Select

Retrieve a single field

```ts
db.select(User.name).from(User)
```

Or an object of data

```ts
import {eq, include} from 'rado'
db.select({
   // Get all user fields: id, username
  ...User,
  // Aggregate posts of this user
  posts: include(db.select().from(Post).where(eq(Post.userId, User.id))) 
}).from(User)
```

Join other tables and select fields from either table:

```ts
db
  .select({
    username: User.username
    post: Post
  })
  .from(User)
  .innerJoin(Post, eq(Post.userId, User.id))
  .where(eq(User.id, 1))
```

Order, group, limit queries:

```ts
import {asc} from 'rado'
db.select().from(User)
  .orderBy(asc(User.username))
  .groupBy(User.id, User.username)
  .limit(10, 20)
```

#### Insert

Insert a single row:

```ts
db.insert(User).values({username: 'Mario'})
```

Insert multiple rows:

```ts
db.insert(User).values([{username: 'Mario'}, {username: 'Luigi'}])
```

#### Update

Set values

```ts
db.update(User)
  .set({username: 'Bowser'})
  .where(eq(User.id, 1))
```

Use expressions to update complex values:

```ts
import {concat} from 'rado/sqlite'
db.update(User)
  .set({username: concat(User.username, ' [removed]')})
  .where(User.deleted)
```

#### Delete

Delete rows

```ts
db.delete(User).where(eq(User.id, 1))
```

## Schema definition

```ts
import * as sqlite from 'rado/sqlite'
import {sqliteTable as table} from 'rado/sqlite'

const User = table({
  id: sqlite.integer().primaryKey(),
  userName: sqlite.text('user') // Column names are optional
})

const Post = table({
  id: sqlite.integer().primaryKey(),
  userId: sqlite.integer().references(() => User.id),
  content: sqlite.text()
})

const Tag = table({
  id: sqlite.integer().primaryKey(),
  name: sqlite.text()
})

const PostTags = table({
  postId: sqlite.integer().references(() => Post.id),
  tagId: sqlite.integer().references(() => Tag.id)
})
```

## Connections

Currently supported drivers:

| Driver           | import                           |
| ---------------- | -------------------------------- |
| `better-sqlite3` | `{'better-sqlite3' as connect}'` |
| `bun-sqlite`     | `{'bun-sqlite' as connect}`      |
| `mysql2`         | `{'mysql2' as connect}`          |
| `pg`             | `{'pg' as connect}`              |
| `pglite`         | `{'pglite' as connect}`          |
| `sql.js`         | `{'sql.js' as connect}`          |

Pass an instance of the database to the `connect` function to get started:

```ts
import Database from 'better-sqlite3'
import {'better-sqlite3' as connect} from 'rado/driver'

const db = connect(new Database('foobar.db'))
```


#### Run queries

Call the connection with a query to retrieve its results:

```ts
// For sync drivers this will be an array:
const posts = db.select().from(Post).all()
// For async drivers this will be a Promise:
const posts = await db.select().from(Post)
```

#### Transactions

Run transactions within the `transaction` method which will isolate a connection
and can optionally return a result:

```ts
const firstUserId = db.transaction(tx => {
  const createTable = db.create(User)
  tx(createTable)
  const insertUser = db.insert(User).values({username: 'Mario'}).returning(User.id)
  return tx(insertUser)
})
```
