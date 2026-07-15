# Custom column types

When the built-in column types don't cover your case, define your own. This
works for exotic database types, custom serialization and value objects. A
column is a `Column` instance with a SQL type and optional value mappers.

## The basic recipe

```ts
import {Column, sql} from 'rado'

export function bool(name?: string): Column<boolean | null> {
  return new Column({
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

// Use it like any other column
const User = table('user', {
  isActive: bool()
})
```

The pieces:

- **`type`**: a SQL fragment used in `create table` and migrations
- **`mapToDriverValue`**: converts your JavaScript value to what the driver
  expects, applied on insert/update and in conditions
- **`mapFromDriverValue`**: converts the raw driver value back, applied to
  results
- **`name`**: optional explicit column name, forwarded as usual

The generic parameter of `Column<T>` sets the TypeScript type; modifiers like
`.notNull()` keep working on top.

## Example: storing a Set as JSON

```ts
import {Column, sql} from 'rado'

function stringSet(name?: string): Column<Set<string> | null> {
  return new Column({
    name,
    type: sql`text`,
    mapToDriverValue: (value: Set<string>) => JSON.stringify([...value]),
    mapFromDriverValue: (value: string) => new Set(JSON.parse(value))
  })
}
```

## Example: per-dialect SQL types

Use `sql.universal` to emit a different type per database. This is how the
[universal columns](columns-universal.md) are built:

```ts
import {Column, sql} from 'rado'

function binary(name?: string): Column<Uint8Array | null> {
  return new Column({
    name,
    type: sql.universal({
      postgres: sql`bytea`,
      default: sql`blob`
    })
  })
}
```

## Typed JSON columns

If your custom column stores JSON and you want
[typed property access](../queries/json.md) on it (`Table.column.some.path`),
use `JsonColumn` instead of `Column`:

```ts
import {JsonColumn, sql} from 'rado'

function settings(name?: string): JsonColumn<{theme: string}> {
  return new JsonColumn({
    name,
    type: sql`jsonb`,
    mapToDriverValue: JSON.stringify,
    mapFromDriverValue: (value: string) => JSON.parse(value)
  })
}
```

> Note: drivers differ in whether they hand JSON back parsed or as text.
> When rado knows the driver parses JSON natively it skips your
> `mapFromDriverValue` accordingly. Test against the drivers you target.

## Narrowing instead of mapping

If you only need a narrower TypeScript type and the runtime value is already
right, skip the custom column and use `$type`:

```ts
const User = table('user', {
  id: integer().primaryKey().$type<UserId>()
})
```
