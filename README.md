# rado

Fully typed, lightweight TypeScript query builder.
Currently focused on SQLite.

<pre>npm install <a href="https://www.npmjs.com/package/rado">rado</a></pre>

- Definition via TypeScript types
- Composable queries
- Aggregate rows in selects
- First class JSON columns
- No code generation step
- No dependencies

## Queries

#### Where

Conditions can be created by accessing the fields of the table
instances and using the operators of `Expr`:

```ts
User.id // This is an Expr<number> which has an `is` method to compare
User.id.is(1) // Compare with a value, results in an Expr<boolean>
User.id.is(Post.userId) // Compare to fields on other tables
```

Rows can be selected by passing the condition in the where method:

```ts
// Call a table instance to start a query selecting from that table
User().where(User.id.is(1))
// Conditions can be as complex as you want
User().where(User.id.isGreater(1).and(User.id.isLess(5)))
// `And` conditions can also be comma separated in `where` to improve readability
User().where(User.id.isGreater(1), User.id.isLess(5))
```

There's a shortcut for comparing columns of a table directly in its call.
The first comparison above can be simplified to:

```ts
User({id: 1}) // Is the same as User().where(User.id.is(1))
```

This comes in handy when joining tables too:

```ts
User({id: 1}).innerJoin(Post({userId: User.id}))
// Is equal to:
User().innerJoin(Post, Post.userId.is(User.id)).where(User.id.is(1))
```

#### Select

Retrieve a single field

```ts
User().select(User.name)
```

Or an object of data

```ts
User().select({
  ...User, // Get all user fields: id, username
  posts: Post({userId: User.id}) // Aggregate posts of this user
})
```

You can call the `posts` helper method defined in the example schema below
to achieve the same:

```ts
User().select({
  ...User,
  posts: User.posts()
})
```

Retrieve all posts with their author and tags and count the tag usage in other
posts:

```ts
import {count} from 'rado/sqlite'
// Alias tables using `as`
const pt = PostTags().as('pt')
Post().select({
  ...Post,
  author: Post.author().select(User.username),
  tags: Post.tags().select({
    count: pt({tagId: Tag.id}).select(count()).sure(),
    name: Tag.name
  })
})
```

Join other tables and select fields from either table:

```ts
User({id: 1}).innerJoin(Post({userId: User.id})).select({
  username: User.username
  post: Post
})
```

Create expressions to select complex values:

```ts
import {iif} from 'rado/sqlite'
Person().select({
  name: Person.firstName.concat(' ').concat(Person.lastName),
  isMario: Person.firstName.is('Mario'),
  isActor: Person.id.isIn(Actor().select(Actor.personId)),
  email: iif(Person.email.isNotNull(), Person.email, 'its.me@mario')
})
```

Order, group, limit queries:

```ts
User()
  .orderBy(User.username.asc())
  .groupBy(User.id, User.username)
  .skip(20)
  .take(10)
```

#### Insert

Insert a single row and return the result:

```ts
User().insertOne({username: 'Mario'})
```

Insert multiple rows:

```ts
User().insertAll([{username: 'Mario'}, {username: 'Luigi'}])
```

#### Update

Set values

```ts
User({id: 1}).set({username: 'Bowser'})
```

Use expressions to update complex values:

```ts
User()
  .set({username: User.username.concat(' [removed]')})
  .where(User.deleted)
```

#### Delete

Delete rows

```ts
User({id: 1}).delete()
```

## Schema definition

```ts
import {table, column} from 'rado'

const User = table({
  // Pass a definition under a key with the actual name of the table in database
  user: class {
    id = column.integer.primaryKey()
    username = column.string

    // Define helper methods directly on the model
    posts() {
      return Post({userId: this.id})
    }
  }
})

const Post = table({
  post: class {
    id = column.integer.primaryKey()
    userId = column.integer.references(() => User.id)
    content = column.string

    author() {
      return User({id: this.userId}).sure()
    }

    tags() {
      return Tag({id: PostTags.tagId}).innerJoin(PostTags({postId: this.id}))
    }
  }
})

const Tag = table({
  tag: class {
    id = column.integer.primaryKey()
    name = column.string
  }
})

const PostTags = table({
  post_tag: class {
    postId = column.integer.references(() => Post.id)
    tagId = column.integer.references(() => Tag.id)
  }
})
```

## Connections

Currently supported SQLite drivers:
`better-sqlite3`, `sql.js`, `sqlite3`, `bun:sqlite`

Pass an instance of the database to the `connect` function to get started:

```ts
import Database from 'better-sqlite3'
import {connect} from 'rado/driver/better-sqlite3'

const db = connect(new Database('foobar.db'))
```

Currently all drivers are synchronous except for the `sqlite3` driver which is
async.

#### Run queries

Call the connection with a query to retrieve its results:

```ts
const posts = db(Post())
// For async drivers this will be a Promise:
const posts = await db(Post())
```

#### Iterate results

Iterate over query results:

```ts
const allPosts = Post()
for (const row of db.iterate(allPosts)) {
  console.log(row)
}
// For async drivers:
for await (const row of db.iterate(allPosts)) {
  console.log(row)
}
```

#### Transactions

Run transactions within the `transaction` method which will isolate a connection
and can optionally return a result:

```ts
const firstUserId = db.transaction(tx => {
  const createTable = User().create()
  tx(createTable)
  const insertUser = User().insertOne({username: 'Mario'})
  tx(insertUser)
  return insertUser.id
})
```
