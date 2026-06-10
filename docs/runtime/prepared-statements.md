# Prepared statements

Queries with named placeholders can be prepared once and executed many times
with different inputs — skipping query construction and, on drivers that
support it, reusing the database's prepared statement.

## Placeholders + `prepare`

```ts
import {eq, sql} from 'rado'

const userByName = db
  .select()
  .from(User)
  .where(eq(User.name, sql.placeholder('name')))
  .prepare('userByName')

const ada = await userByName.execute({name: 'Ada'})
const grace = await userByName.execute({name: 'Grace'})
```

`sql.placeholder(name)` marks a named input; `prepare(name?)` turns the query
into a `PreparedQuery`. The name is forwarded to drivers that use named
statements (PostgreSQL, MySQL); SQLite drivers prepare by statement text.

A prepared query exposes the usual executors:

```ts
await userByName.all({name: 'Ada'})    // Array<Row>
await userByName.get({name: 'Ada'})    // Row | undefined
await userByName.run({name: 'Ada'})    // void
await userByName.execute({name: 'Ada'})
userByName.free() // release the underlying statement when done
```

Missing an input? You get an error naming the missing placeholder rather than
a silent `null`.

## Placeholders anywhere

Placeholders work wherever values do — conditions, limits, inserted values:

```ts
const page = db
  .select()
  .from(Post)
  .orderBy(desc(Post.createdAt))
  .limit(sql.placeholder('pageSize'))
  .offset(sql.placeholder('offset'))
  .prepare('page')

await page.all({pageSize: 10, offset: 20})
```

## One-off execution with inputs

You don't have to `prepare` to use placeholders — `execute(inputs)` works on
any query:

```ts
await db
  .select()
  .from(User)
  .where(eq(User.name, sql.placeholder('name')))
  .execute({name: 'Ada'})
```

## Inspecting generated SQL

Every query can show you what it compiles to:

```ts
const {sql: text, params} = db
  .select()
  .from(User)
  .where(eq(User.id, 1))
  .toSQL()

// text: 'select "user"."id", "user"."name", ... from "user" where "user"."id" = $1'
// params: [1]
```

Without a database argument `toSQL()` uses the dialect the query was built
for; you can also pass a database to emit for its dialect. Useful for logging,
debugging, snapshot tests and satisfying healthy curiosity.
