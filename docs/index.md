# rado

Fully typed, lightweight TypeScript query builder.

Rado lets you describe tables in TypeScript and write SQL-shaped queries with
inferred result, insert, and update types. The API is organized around SQL:
define tables and views, connect a driver, select rows, insert rows, update
rows, delete rows, compose expressions, and run transactions.

## Installation

```sh
npm install rado
```

```ts
import {table} from 'rado'
import {integer, text} from 'rado/postgres'
import {connect} from 'rado/driver/pg'
```

## Quick start

```ts
import {eq, table} from 'rado'
import {integer, text} from 'rado/postgres'
import {connect} from 'rado/driver/pg'
import {Pool} from 'pg'

const User = table('user', {
  id: integer().primaryKey(),
  name: text().notNull(),
  email: text().unique()
})

const db = connect(new Pool({database: 'app'}))

const users = await db
  .select({id: User.id, name: User.name})
  .from(User)
  .where(eq(User.email, 'ada@example.com'))
```

## Supported databases

| Database | Driver package | Rado import |
| --- | --- | --- |
| PostgreSQL | `pg` | `rado/driver/pg` |
| PostgreSQL | `@electric-sql/pglite` | `rado/driver/pglite` |
| PostgreSQL | `@neondatabase/serverless` | `rado/driver/pg` |
| PostgreSQL | `@vercel/postgres` | `rado/driver/pg` |
| SQLite | `better-sqlite3` | `rado/driver/better-sqlite3` |
| SQLite | `bun:sqlite` | `rado/driver/bun-sqlite` |
| SQLite | `sql.js` | `rado/driver/sql.js` |
| SQLite | `@libsql/client` | `rado/driver/libsql` |
| SQLite | Cloudflare D1 | `rado/driver/d1` |
| MySQL | `mysql2` | `rado/driver/mysql2` |

## Schema definition

<details open>
<summary>Tables</summary>

Tables are the typed source for `select`, `insert`, `update`, and `delete`.

```ts
import {table, alias, type InsertRow, type SelectRow, type UpdateRow} from 'rado'
import {integer, text} from 'rado/postgres'

const User = table('user', {
  id: integer().primaryKey(),
  name: text().notNull(),
  email: text()
})

const Author = alias(User, 'author')

type UserRow = SelectRow<typeof User>
type NewUser = InsertRow<typeof User>
type UserPatch = UpdateRow<typeof User>
```

Public table APIs:

| API | Import | Purpose |
| --- | --- | --- |
| `table(name, columns, config?)` | `rado` | Define a table with inferred fields and row types. |
| `alias(table, alias)` | `rado` | Reuse a table in self-joins or shorter query names. |
| `tableCreator(fn)` | `rado` | Create a table helper that maps TypeScript names to SQL names. |
| `pgTable`, `pgTableCreator` | `rado/postgres` | PostgreSQL aliases for `table` and `tableCreator`. |
| `sqliteTable`, `sqliteTableCreator` | `rado/sqlite` | SQLite aliases for `table` and `tableCreator`. |
| `mysqlTable`, `mysqlTableCreator` | `rado/mysql` | MySQL aliases for `table` and `tableCreator`. |
| `Table`, `TableRow`, `TableInsert`, `TableUpdate` | `rado` | Type helpers for table definitions and row shapes. |
| `SelectRow<T>`, `InsertRow<T>`, `UpdateRow<T>` | `rado` | Extract row/input types from a table. |

</details>

<details>
<summary>Columns</summary>

Columns define SQL types and TypeScript value types.

```ts
import {Column, column, table, sql} from 'rado'

export function bool(name?: string): Column<boolean | null> {
  return new Column({
    name,
    type: column['tinyint'](1),
    mapFromDriverValue(value) {
      return value === 1
    },
    mapToDriverValue(value) {
      return value ? 1 : 0
    }
  })
}
```

Column modifiers:

| API | Purpose |
| --- | --- |
| `.notNull()` | Mark the column as non-nullable. |
| `.primaryKey(options?)` | Mark as primary key. `options.autoIncrement` emits auto-increment where supported. |
| `.unique(name?)` | Add a single-column unique constraint. |
| `.default(value)` | Add a SQL default value. |
| `.defaultNow()` | Add `now()` as the SQL default. |
| `.$default(valueOrFn)` / `.$defaultFn(fn)` | Runtime insert default used when a value is omitted. |
| `.$onUpdate(fn)` / `.$onUpdateFn(fn)` | Runtime update value used by insert/update formatting. |
| `.references(fieldOrFn, options?)` | Add a foreign key reference with optional `onDelete` and `onUpdate`. |
| `.$type<T>()` | Override the TypeScript value type. |
| `.mapWith(decoder)` | Available on `Sql`; map driver output for expressions. |

Core column APIs:

| API | Import | Purpose |
| --- | --- | --- |
| `Column` | `rado` | Build custom column types. |
| `JsonColumn` | `rado` | Column class with JSON path access. |
| `ColumnType` | `rado` | Low-level SQL type representation. |
| `column` | `rado` | Proxy for arbitrary SQL type constructors. |
| `columnConfig(args)` | `rado` | Helper for `(name?, options?)` column factories. |

Universal columns from `rado/universal`: `id`, `text`, `varchar`, `integer`,
`number`, `boolean`, `json`, `jsonb`, `blob`.

PostgreSQL columns from `rado/postgres`: `bigint`, `bigserial`, `bit`,
`boolean`, `bytea`, `char`, `cidr`, `date`, `doublePrecision`, `geometry`,
`halfvec`, `inet`, `integer`, `int`, `interval`, `json`, `jsonb`, `line`,
`macaddr`, `macaddr8`, `numeric`, `oid`, `point`, `real`, `serial`, `smallint`,
`smallserial`, `sparsevec`, `text`, `time`, `timestamp`, `uuid`, `varbit`,
`varchar`, `vector`.

SQLite columns from `rado/sqlite`: `boolean`, `integer`, `int`, `blob`, `text`,
`real`, `numeric`, `json`, `jsonb`.

MySQL columns from `rado/mysql`: `bigint`, `binary`, `boolean`, `blob`, `char`,
`date`, `datetime`, `decimal`, `float`, `integer`, `int`, `json`, `longtext`,
`mediumint`, `mediumtext`, `real`, `serial`, `smallint`, `text`, `time`,
`timestamp`, `tinyint`, `tinytext`, `varbinary`, `varchar`, `year`.

</details>

<details>
<summary>Constraints and indexes</summary>

```ts
import {foreignKey, index, primaryKey, table, unique, uniqueIndex} from 'rado'
import {integer, text} from 'rado/postgres'

const User = table(
  'user',
  {
    id: integer(),
    orgId: integer(),
    email: text().notNull()
  },
  t => ({
    pk: primaryKey(t.id),
    emailUnique: unique().on(t.orgId, t.email).nullsNotDistinct(),
    orgIndex: index().on(t.orgId),
    emailIndex: uniqueIndex().on(t.email),
    orgFk: foreignKey(t.orgId).references(Org.id)
  })
)
```

Public APIs:

| API | Import | Purpose |
| --- | --- | --- |
| `primaryKey(...fields)` | `rado`, dialect modules | Multi-column primary key. |
| `primaryKey({name, columns})` | `rado`, dialect modules | Named multi-column primary key. |
| `foreignKey(...fields).references(...foreignFields)` | `rado`, dialect modules | Table-level foreign key. |
| `foreignKey({name, columns, foreignColumns})` | `rado`, dialect modules | Named table-level foreign key. |
| `unique(name?).on(...fields)` | `rado`, dialect modules | Table-level unique constraint. |
| `.nullsNotDistinct()` | `UniqueConstraint` | PostgreSQL-style null equality for unique constraints. |
| `index().on(...fields)` | `rado`, dialect modules | Non-unique index. |
| `uniqueIndex().on(...fields)` | `rado`, dialect modules | Unique index. |
| `.concurrently()` | `Index` | Mark index as concurrent. |
| `.only()` | `Index` | Mark index as only. |
| `.using(expr)` | `Index` | Set index method/expression. |
| `.asc()`, `.desc()` | `Index` | Set sort direction. |
| `.nullsFirst()`, `.nullsLast()` | `Index` | Set null ordering. |
| `.where(condition)` | `Index` | Add a partial-index predicate. |

</details>

## Select

<details open>
<summary>Basic select</summary>

```ts
const allUsers = await db.select().from(User)

const names = await db
  .select({id: User.id, name: User.name})
  .from(User)
```

Builder APIs:

| API | Purpose |
| --- | --- |
| `db.select()` | Select all fields from the source. |
| `db.select(selection)` | Select a typed object, table, field, or SQL expression. |
| `db.selectDistinct()` | Select distinct rows. |
| `db.selectDistinct(selection)` | Select distinct values from a selection. |
| `db.selectDistinctOn(columns, selection?)` | PostgreSQL `distinct on`. |
| `db.$query(queryObject)` | Build a query from a structured query object. |

Select chain APIs:

| API | Purpose |
| --- | --- |
| `.from(tableOrSubqueryOrSql)` | Set the select source. |
| `.where(...conditions)` | Add predicates. Undefined conditions are ignored. |
| `.groupBy(...expressions)` | Add `group by`. |
| `.having(conditionOrFn)` | Add `having`; may receive selected aliases. |
| `.orderBy(...expressions)` | Add `order by`. |
| `.limit(value)` | Add `limit`. |
| `.offset(value)` | Add `offset`. |
| `.$first()` | Execute/select as one row instead of an array. |
| `.$dynamic()` | Preserve the query for dynamic composition. |
| `.for(keyword, config?)` | PostgreSQL row locking: `update`, `no key update`, `share`, `key share`. |
| `.as(name)` | Alias a select/union as a subquery. |

Executable query APIs:

| API | Purpose |
| --- | --- |
| `await query` | Execute using the default result mode. |
| `.all(db?)` | Execute and return all rows. |
| `.get(db?)` | Execute and return one row or `null`. |
| `.run(db?)` | Execute without returning rows. |
| `.execute(inputs?, db?)` | Execute a prepared-style query with inputs. |
| `.prepare<Inputs>(name?)` | Prepare a reusable statement. |
| `.toSQL(db?)` | Return `{sql, params}` without executing. |

</details>

<details>
<summary>Joins</summary>

```ts
const rows = await db
  .select({
    userName: User.name,
    postTitle: Post.title
  })
  .from(User)
  .leftJoin(Post, eq(Post.authorId, User.id))
```

Join APIs:

| API | SQL |
| --- | --- |
| `.innerJoin(target, on)` | `inner join` |
| `.innerJoinLateral(target, on)` | `inner join lateral` |
| `.leftJoin(target, on)` | `left join` |
| `.leftJoinLateral(target, on)` | `left join lateral` |
| `.rightJoin(target, on)` | `right join` |
| `.fullJoin(target, on)` | `full join` |
| `.crossJoin(target)` | `cross join` |
| `.crossJoinLateral(target)` | `cross join lateral` |

</details>

<details>
<summary>Set operations</summary>

```ts
import {unionAll} from 'rado'

const active = db.select({id: User.id}).from(User).where(eq(User.active, true))
const invited = db.select({id: Invite.userId}).from(Invite)

const users = await unionAll(active, invited).orderBy(sql.identifier('id'))
```

Public APIs:

| API | Import | Notes |
| --- | --- | --- |
| `union(left, right, ...rest)` / `.union(query)` | `rado`, dialect modules | Standard union. |
| `unionAll(left, right, ...rest)` / `.unionAll(query)` | `rado`, dialect modules | Keep duplicates. |
| `intersect(left, right, ...rest)` / `.intersect(query)` | `rado`, dialect modules | Common rows. |
| `intersectAll(left, right, ...rest)` / `.intersectAll(query)` | `rado/postgres`, `rado/mysql` | Keep duplicates where supported. |
| `except(left, right, ...rest)` / `.except(query)` | `rado`, dialect modules | Rows in left but not right. |
| `exceptAll(left, right, ...rest)` / `.exceptAll(query)` | `rado/postgres`, `rado/mysql` | Keep duplicates where supported. |
| `Union.orderBy`, `Union.limit`, `Union.offset` | query instance | Modifiers on compound selects. |

</details>

<details>
<summary>Subqueries and CTEs</summary>

```ts
const prolific = db
  .select({authorId: Post.authorId})
  .from(Post)
  .groupBy(Post.authorId)
  .having(gt(count(Post.id), 5))
  .as('prolific')

const rows = await db
  .select()
  .from(User)
  .innerJoin(prolific, eq(prolific.authorId, User.id))
```

```ts
const recentPosts = db
  .$with('recent_posts')
  .as(db.select().from(Post).where(gt(Post.createdAt, since)))

const rows = await db
  .with(recentPosts)
  .select()
  .from(recentPosts)
```

Public APIs:

| API | Purpose |
| --- | --- |
| `.as(name)` | Alias a query as a subquery target. |
| `db.$with(name).as(query)` | Define a CTE from a query. |
| `db.$with(name, columns).as(sql)` | Define a CTE from raw SQL and explicit columns. |
| `db.with(...ctes)` | Add `with` definitions to the next query. |
| `db.withRecursive(...ctes)` | Add `with recursive` definitions to the next query. |
| `exists(query)` | Build an `exists (...)` condition. |

</details>

<details>
<summary>Include</summary>

`include` aggregates a related select into a JSON-backed field.

```ts
import {include} from 'rado'

const users = await db
  .select({
    ...User,
    posts: include(
      db.select().from(Post).where(eq(Post.authorId, User.id))
    )
  })
  .from(User)
```

| API | Purpose |
| --- | --- |
| `include(select)` | Include many related rows as an array. |
| `include.one(select)` | Include one related row or `null`. |

</details>

## Insert

<details open>
<summary>Insert rows</summary>

```ts
const user = await db
  .insert(User)
  .values({name: 'Ada', email: 'ada@example.com'})
  .returning()
  .$first()
```

```ts
await db.insert(User).values([
  {name: 'Ada', email: 'ada@example.com'},
  {name: 'Grace', email: 'grace@example.com'}
])
```

Public APIs:

| API | Purpose |
| --- | --- |
| `db.insert(table)` | Start an insert. |
| `.overridingSystemValue()` | Emit `overriding system value`. |
| `.values(row)` | Insert one row. |
| `.values(rows)` | Insert many rows. |
| `.select(query)` | Insert from a select with matching fields. |
| `.returning()` | PostgreSQL/SQLite: return inserted table fields. |
| `.returning(selection)` | PostgreSQL/SQLite: return a typed selection. |
| `insertQuery(queryObject)` | Format a structured insert query object. |

</details>

<details>
<summary>Conflicts and upserts</summary>

```ts
await db
  .insert(User)
  .values({email: 'ada@example.com', name: 'Ada'})
  .onConflictDoUpdate({
    target: User.email,
    set: {name: 'Ada Lovelace'}
  })
```

```ts
await db
  .insert(User)
  .values({email: 'ada@example.com', name: 'Ada'})
  .onConflictDoNothing({target: User.email})
```

```ts
await db
  .insert(User)
  .values({email: 'ada@example.com', name: 'Ada'})
  .onDuplicateKeyUpdate({set: {name: 'Ada Lovelace'}})
```

Public APIs:

| API | Dialects | Purpose |
| --- | --- | --- |
| `.onConflictDoNothing(options?)` | PostgreSQL, SQLite | `on conflict ... do nothing`. |
| `.onConflictDoUpdate(options)` | PostgreSQL, SQLite | `on conflict ... do update set ...`. |
| `.onDuplicateKeyUpdate(options)` | MySQL | `on duplicate key update ...`. |

Conflict options:

| Option | Purpose |
| --- | --- |
| `target` | Conflict target field or fields. |
| `targetWhere` | Predicate on the conflict target. |
| `set` | Values for the update. |
| `where` | Predicate on the conflict update. |

</details>

## Update

<details open>
<summary>Update rows</summary>

```ts
const changed = await db
  .update(User)
  .set({name: 'Ada Lovelace'})
  .where(eq(User.email, 'ada@example.com'))
  .returning({id: User.id, name: User.name})
```

Public APIs:

| API | Purpose |
| --- | --- |
| `db.update(table)` | Start an update. |
| `.set(values)` | Set typed update values. |
| `.where(...conditions)` | Add predicates. Undefined conditions are ignored. |
| `.orderBy(...expressions)` | Add `order by` where supported. |
| `.limit(value)` | Add `limit` where supported. |
| `.offset(value)` | Add `offset` where supported. |
| `.returning()` | PostgreSQL/SQLite: return updated table fields. |
| `.returning(selection)` | PostgreSQL/SQLite: return a typed selection. |
| `updateQuery(queryObject)` | Format a structured update query object. |

</details>

## Delete

<details open>
<summary>Delete rows</summary>

```ts
await db
  .delete(User)
  .where(eq(User.email, 'ada@example.com'))
```

Public APIs:

| API | Purpose |
| --- | --- |
| `db.delete(table)` | Start a delete. |
| `.where(...conditions)` | Add predicates. Undefined conditions are ignored. |
| `.orderBy(...expressions)` | Add `order by` where supported. |
| `.limit(value)` | Add `limit` where supported. |
| `.offset(value)` | Add `offset` where supported. |
| `.returning()` | PostgreSQL/SQLite: return deleted table fields. |
| `.returning(selection)` | PostgreSQL/SQLite: return a typed selection. |
| `deleteQuery(queryObject)` | Format a structured delete query object. |

</details>

## Views and schema objects

<details open>
<summary>Views</summary>

```ts
import {view} from 'rado'

const ActiveUsers = view('active_users').as(
  db.select({id: User.id, name: User.name})
    .from(User)
    .where(eq(User.active, true))
)

await db.create(ActiveUsers)
```

Public APIs:

| API | Import | Purpose |
| --- | --- | --- |
| `view(name).as(query)` | `rado` | Define a view from a select/union query. |
| `view(name, columns).existing()` | `rado` | Reference an existing view with declared fields. |
| `view(name, columns).as(sql)` | `rado` | Define a view from raw SQL and declared fields. |
| `materializedView(...)` | `rado`, `rado/postgres` | Same API for materialized views. |
| `pgView`, `pgMaterializedView` | `rado/postgres` | PostgreSQL named exports. |
| `sqliteView` | `rado/sqlite` | SQLite named export. |
| `mysqlView` | `rado/mysql` | MySQL named export. |
| `db.refreshMaterializedView(view)` | database | PostgreSQL refresh helper. |

</details>

<details>
<summary>Schemas and enums</summary>

```ts
import {pgSchema, pgEnum} from 'rado/postgres'

const app = pgSchema('app')
const Role = app.enum('role', ['admin', 'member'] as const)

const User = app.table('user', {
  id: integer().primaryKey(),
  role: Role().notNull()
})
```

Public APIs:

| API | Import | Purpose |
| --- | --- | --- |
| `pgSchema(name)` | `rado/postgres` | PostgreSQL schema object with create/drop support. |
| `schema.table(name, columns, config?)` | `PgSchema` | Define a table inside a schema. |
| `schema.enum(name, values)` | `PgSchema` | Define a PostgreSQL enum inside a schema. |
| `schema.view(name, columns?)` | `PgSchema` | Define a view inside a schema. |
| `schema.materializedView(name, columns?)` | `PgSchema` | Define a materialized view inside a schema. |
| `mysqlSchema(name)` | `rado/mysql` | MySQL schema helper. |
| `pgEnum(name, values)` | `rado/postgres` | PostgreSQL enum column factory with create/drop support. |

</details>

## Create, drop, and migrations

<details open>
<summary>Create and drop</summary>

Tables, views, materialized views, PostgreSQL schemas, and PostgreSQL enums can
be passed to `db.create` and `db.drop`.

```ts
await db.create(app, User, ActiveUsers)
await db.drop(ActiveUsers, User, app)
```

Public APIs:

| API | Purpose |
| --- | --- |
| `db.create(...createables)` | Execute all create SQL from each object as a batch. |
| `db.drop(...droppables)` | Execute all drop SQL from each object as a batch. |
| `db.migrate(...tables)` | Compute table diffs and execute migration SQL in a transaction. |
| `postgresDiff`, `sqliteDiff`, `mysqlDiff` | Dialect diff functions exported by dialect modules. |
| `HasCreate`, `HasDrop` | Low-level interfaces for create/drop-capable objects. |

</details>

## Transactions

<details open>
<summary>Transactions</summary>

```ts
const result = await db.transaction(async tx => {
  const user = await tx
    .insert(User)
    .values({name: 'Ada', email: 'ada@example.com'})
    .returning()
    .$first()

  await tx.insert(Profile).values({userId: user.id})
  return user
})
```

```ts
await db.transaction(async tx => {
  const user = await tx.select().from(User).where(eq(User.id, id)).$first()
  if (!user) tx.rollback({reason: 'missing-user'})
})
```

Public APIs:

| API | Purpose |
| --- | --- |
| `db.transaction(callback, options?)` | Run sync or async work in a transaction. |
| `tx.rollback(data?)` | Abort and throw a typed `Rollback`. |
| `Rollback` | Error class carrying rollback data. |
| `txGenerator(generator)` | Universal transaction helper for generator-based flows. |

Transaction options:

| Dialect | Options |
| --- | --- |
| universal | `async` |
| SQLite | `async`, `behavior: 'deferred' | 'immediate' | 'exclusive'` |
| PostgreSQL | `async`, `isolationLevel`, `accessMode`, `deferrable` |
| MySQL | `async`, `isolationLevel`, `accessMode`, `withConsistentSnapshot` |

</details>

## SQL expressions

<details open>
<summary>Conditions</summary>

```ts
import {and, eq, gt, ilike, isNotNull, or} from 'rado'

const adults = await db
  .select()
  .from(User)
  .where(
    and(
      gt(User.age, 18),
      isNotNull(User.email),
      or(ilike(User.name, 'a%'), eq(User.role, 'admin'))
    )
  )
```

Condition APIs from `rado`:

| API | SQL |
| --- | --- |
| `eq(left, right)` | `=` |
| `ne(left, right)` | `<>` |
| `gt(left, right)` | `>` |
| `gte(left, right)` | `>=` |
| `lt(left, right)` | `<` |
| `lte(left, right)` | `<=` |
| `like(left, right)` / `notLike(left, right)` | `like` / `not like` |
| `ilike(left, right)` / `notILike(left, right)` | `ilike` / `not ilike` |
| `arrayContains(left, right)` | `@>` |
| `arrayContained(left, right)` | `<@` |
| `arrayOverlaps(left, right)` | `&&` |
| `and(...conditions)` | `and`, ignoring `undefined`. |
| `or(...conditions)` | `or`, ignoring `undefined`. |
| `not(condition)` | `not`. |
| `inArray(left, valuesOrQuery)` | `in (...)`. |
| `notInArray(left, valuesOrQuery)` | `not in (...)`. |
| `isNull(value)` / `isNotNull(value)` | `is null` / `is not null`. |
| `between(value, left, right)` / `notBetween(...)` | `between` / `not between`. |
| `exists(query)` | `exists (...)`. |
| `when(...)` | SQL `case` expression. |

</details>

<details>
<summary>Ordering, distinct, and aggregates</summary>

```ts
import {asc, count, desc, max} from 'rado'

const rows = await db
  .select({
    authorId: Post.authorId,
    postCount: count(Post.id),
    newest: max(Post.createdAt)
  })
  .from(Post)
  .groupBy(Post.authorId)
  .orderBy(desc(max(Post.createdAt)), asc(Post.authorId))
```

Public APIs:

| API | Purpose |
| --- | --- |
| `asc(expr)` / `desc(expr)` | Ordering expressions. |
| `distinct(expr)` | `distinct expr`. |
| `count(expr?)` | Count rows or values. |
| `countDistinct(expr)` | Count distinct values. |
| `avg(expr)` / `avgDistinct(expr)` | Average values. |
| `sum(expr)` / `sumDistinct(expr)` | Sum values. |
| `min(expr)` / `max(expr)` | Minimum and maximum. |

</details>

<details>
<summary>Raw SQL</summary>

```ts
import {sql} from 'rado'

const minAge = 18

const rows = await db
  .select()
  .from(User)
  .where(sql`${User.age} >= ${minAge}`)
```

Public APIs:

| API | Purpose |
| --- | --- |
| ``sql`...` `` | Parameterized SQL template. |
| `sql.empty()` | Empty SQL fragment. |
| `sql.unsafe(value)` | Direct SQL text. Use only for trusted SQL. |
| `sql.value(value)` | Bound parameter or inline value depending on emitter mode. |
| `sql.inline(value)` | Inline a literal value. |
| `sql.placeholder(name)` | Named placeholder for prepared execution. |
| `sql.identifier(name)` | Escape an SQL identifier. |
| `sql.field(fieldData)` | Low-level field SQL. |
| `sql.jsonPath(path)` | Low-level JSON path SQL. |
| `sql.universal({sqlite, postgres, mysql, default})` | Dialect-specific expression. |
| `sql.query(...chunks)` | Compose SQL clauses from fragments and clause objects. |
| `sql.join(items, separator?)` | Join SQL fragments. |
| `.as(name)` | Alias an expression. |
| `.mapWith(decoder)` | Decode driver output. |
| `.inlineFields(withTableName)` | Change field rendering mode. |
| `.inlineValues()` | Inline values for DDL or direct execution. |
| `.nameSelf(name)` | Name `$$self` references. |
| `.if(condition)` | Return the fragment only when truthy. |

</details>

<details>
<summary>JSON</summary>

JSON columns expose typed path access.

```ts
const User = table('user', {
  id: integer().primaryKey(),
  metadata: jsonb<{subscribed: boolean; plan?: string}>()
})

const subscribers = await db
  .select()
  .from(User)
  .where(eq(User.metadata.subscribed, true))
```

Public JSON helpers exported from `rado`:

| API | Purpose |
| --- | --- |
| `jsonExpr(expr)` | Convert a SQL expression into typed JSON path access. |
| `jsonArray(...values)` | Build a JSON array expression. |
| `jsonAggregateArray(...values)` | Aggregate rows into a JSON array expression. |

</details>

<details>
<summary>Functions</summary>

```ts
import {Functions} from 'rado'

const lowerName = Functions.lower(User.name).as('lowerName')
```

Public APIs:

| API | Import | Purpose |
| --- | --- | --- |
| `callFunction(name, args?)` | `rado` | Build an SQL function call. |
| `Functions` | `rado` | Proxy for arbitrary SQL functions. |
| `lastInsertId()` | `rado/universal` | Dialect-aware last inserted id expression. |
| `concat(...values)` | `rado/universal` | Dialect-aware string concatenation. |

SQLite functions exported from `rado/sqlite`: `abs`, `acos`, `acosh`, `asin`,
`asinh`, `atan`, `atan2`, `atanh`, `avg`, `bm25`, `cast`, `ceil`, `changes`,
`char`, `coalesce`, `cos`, `cosh`, `count`, `date`, `datetime`, `degrees`,
`exp`, `floor`, `group_concat`, `hex`, `highlight`, `ifnull`, `iif`, `instr`,
`julianday`, `last_insert_rowid`, `length`, `likelihood`, `likely`, `ln`,
`log`, `log2`, `lower`, `ltrim`, `max`, `min`, `mod`, `nullif`, `pi`, `pow`,
`prnumberf`, `quote`, `radians`, `random`, `randomblob`, `replace`, `round`,
`rtrim`, `sign`, `sin`, `sinh`, `snippet`, `soundex`, `sqlite_version`,
`sqliteTypeof`, `strftime`, `substr`, `sum`, `tan`, `tanh`, `time`,
`total_changes`, `trim`, `trunc`, `unicode`, `unlikely`, `upper`.

</details>

## Database and drivers

<details open>
<summary>Connect</summary>

```ts
import Database from 'better-sqlite3'
import {connect} from 'rado/driver/better-sqlite3'

const db = connect(new Database('app.db'))
```

Each driver module exports `connect(client)`.

| Import | Result |
| --- | --- |
| `rado/driver/pg` | `AsyncDatabase<'postgres'>` |
| `rado/driver/pglite` | `AsyncDatabase<'postgres'>` |
| `rado/driver/mysql2` | `AsyncDatabase<'mysql'>` |
| `rado/driver/better-sqlite3` | `SyncDatabase<'sqlite'>` |
| `rado/driver/bun-sqlite` | `SyncDatabase<'sqlite'>` |
| `rado/driver/sql.js` | `SyncDatabase<'sqlite'>` |
| `rado/driver/libsql` | `AsyncDatabase<'sqlite'>` |
| `rado/driver/d1` | `AsyncDatabase<'sqlite'>` |

</details>

<details>
<summary>Database utilities</summary>

Public APIs:

| API | Purpose |
| --- | --- |
| `db.close()` | Close the underlying driver. |
| `db.run(sql)` | Execute SQL after dialect inlining. |
| `db.execute(sql)` | Execute SQL with inline values; throws if parameters remain. |
| `db.get(sqlOrQuery)` | Execute and return one value/row. |
| `db.all(sql)` | Execute and return all rows for a SQL expression. |
| `db.batch(queries)` | Execute multiple SQL/query objects. |
| `db.$count(source, condition?)` | Select a single count from a table or SQL source. |
| `SyncDatabase`, `AsyncDatabase`, `Database` | Database classes exported from `rado`. |
| `Driver`, `SyncDriver`, `AsyncDriver` | Driver interfaces for custom drivers. |

</details>

## API index

This index lists public APIs that are intended to be documented on this page.
Lower-level interfaces and types are included when they are useful for custom
drivers, custom columns, or advanced query composition.

| API | Import | Section |
| --- | --- | --- |
| `alias` | `rado`, dialect modules | Tables |
| `and`, `or`, `not` | `rado` | Conditions |
| `asc`, `desc`, `distinct` | `rado` | Ordering |
| `avg`, `avgDistinct`, `count`, `countDistinct`, `max`, `min`, `sum`, `sumDistinct` | `rado` | Aggregates |
| `between`, `notBetween` | `rado` | Conditions |
| `callFunction`, `Functions` | `rado` | Functions |
| `Column`, `JsonColumn`, `ColumnType`, `column`, `columnConfig` | `rado` | Columns |
| `Database`, `SyncDatabase`, `AsyncDatabase` | `rado` | Database utilities |
| `db.$count`, `db.$query`, `db.$with` | database | Database utilities, CTEs |
| `db.all`, `db.batch`, `db.close`, `db.create`, `db.delete`, `db.drop`, `db.execute`, `db.get`, `db.insert`, `db.migrate`, `db.refreshMaterializedView`, `db.run`, `db.select`, `db.selectDistinct`, `db.selectDistinctOn`, `db.transaction`, `db.update`, `db.with`, `db.withRecursive` | database | Relevant SQL sections |
| `deleteQuery`, `insertQuery`, `selectQuery`, `unionQuery`, `updateQuery` | `rado` | Query formatting |
| `eq`, `ne`, `gt`, `gte`, `lt`, `lte` | `rado` | Conditions |
| `exists`, `inArray`, `notInArray` | `rado` | Conditions, subqueries |
| `foreignKey`, `primaryKey`, `unique` | `rado`, dialect modules | Constraints |
| `include`, `include.one` | `rado` | Include |
| `index`, `uniqueIndex` | `rado`, dialect modules | Indexes |
| `InsertRow`, `SelectRow`, `UpdateRow`, `Table`, `TableInsert`, `TableRow`, `TableUpdate` | `rado` | Tables |
| `isNull`, `isNotNull` | `rado` | Conditions |
| `jsonAggregateArray`, `jsonArray`, `jsonExpr` | `rado` | JSON |
| `like`, `notLike`, `ilike`, `notILike` | `rado` | Conditions |
| `materializedView`, `view` | `rado` | Views |
| `pgEnum`, `pgSchema`, `pgTable`, `pgTableCreator`, `pgView`, `pgMaterializedView` | `rado/postgres` | Schema objects |
| `Rollback` | `rado` | Transactions |
| `sql` and namespace helpers | `rado` | Raw SQL |
| `sqliteTable`, `sqliteTableCreator`, `sqliteView` | `rado/sqlite` | Tables, views |
| `mysqlSchema`, `mysqlTable`, `mysqlTableCreator`, `mysqlView` | `rado/mysql` | Tables, views |
| `table`, `tableCreator` | `rado` | Tables |
| `txGenerator`, `concat`, `lastInsertId` | `rado/universal` | Transactions, functions |
| `union`, `unionAll`, `intersect`, `intersectAll`, `except`, `exceptAll` | `rado`, dialect modules | Set operations |
| Driver `connect` | `rado/driver/*` | Connect |
