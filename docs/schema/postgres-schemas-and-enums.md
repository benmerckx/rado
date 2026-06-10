# PostgreSQL schemas & enums

Two Postgres-specific organizational tools: named schemas for namespacing
your tables, and native enum types.

## `pgSchema`

A Postgres schema is a namespace inside a database. Create one and hang
tables, enums and views off it:

```ts
import {pgSchema} from 'rado/postgres'
import {integer, text} from 'rado/postgres'

const app = pgSchema('app')

const User = app.table('user', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull()
})
```

Queries reference the schema-qualified name automatically:

```sql
select "id", "name" from "app"."user"
```

The schema object itself can be passed to `db.create` / `db.drop`:

```ts
await db.create(app, User) // create schema if not exists "app"; create table ...
await db.drop(app)         // drop schema if exists "app" cascade
```

Everything a schema can contain:

```ts
app.table('user', {...})
app.enum('mood', ['sad', 'ok', 'happy'])
app.view('actives').as(...)
app.materializedView('stats').as(...)
```

MySQL has an equivalent `mysqlSchema` export in `rado/mysql` for
schema-qualified table names.

## `pgEnum`

Native Postgres enums are real types in the database, created with
`create type ... as enum`:

```ts
import {pgEnum, pgTable} from 'rado/postgres'

const mood = pgEnum('mood', ['sad', 'ok', 'happy'])

const MoodEntry = pgTable('mood_entry', {
  state: mood().notNull() // typed as 'sad' | 'ok' | 'happy'
})
```

The enum is a column factory: call it (optionally with a column name) wherever
you'd use a column type. The TypeScript type is the union of its values, so
`db.insert(MoodEntry).values({state: 'grumpy'})` is a compile error — as it
should be.

### Creating the type

When you `db.create` a table that uses an enum, rado emits the
`create type` statement for you first. The enum can also live inside a schema:

```ts
const app = pgSchema('app')
const mood = app.enum('mood', ['sad', 'ok', 'happy'])
```

### Dropping

Dropping a table does not drop the type (other tables might use it). Remove it
explicitly when you're sure:

```ts
import {sql} from 'rado'

await db.run(sql`drop type if exists ${sql.identifier('mood')}`)
```

## Enums on other databases

SQLite and MySQL don't get `pgEnum`, but you can constrain text columns at the
type level with SQLite's `text({enum: [...]})` option — same TypeScript
ergonomics, no database-side enforcement:

```ts
import {text} from 'rado/sqlite'

status: text({enum: ['draft', 'published']}) // 'draft' | 'published'
```
