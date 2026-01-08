# Drizzle Query API -> Rado Mapping

Scope: query builder + SQL helper APIs only. This excludes ORM-only features
like relations, `.query.*`, or schema definition helpers.

## Entry Points

| Drizzle API                                        | Rado API                                           | Notes                                                        |
| -------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| `db.select()` / `db.select({...})`                 | `db.select()` / `db.select({...})`                 | Same shape. Rado supports selection objects or empty select. |
| `db.selectDistinct()` / `db.selectDistinct({...})` | `db.selectDistinct()` / `db.selectDistinct({...})` | Same.                                                        |
| `db.selectDistinctOn([...])`                       | `db.selectDistinctOn([...])`                       | Postgres-only in both.                                       |
| `db.insert(table)`                                 | `db.insert(table)`                                 | Same.                                                        |
| `db.update(table)`                                 | `db.update(table)`                                 | Same.                                                        |
| `db.delete(table)`                                 | `db.delete(table)`                                 | Same.                                                        |
| `db.$with('cte').as(query)`                        | `db.$with('cte').as(query)`                        | Same CTE builder pattern.                                    |
| `db.with(cte, ...)`                                | `db.with(cte, ...)`                                | Same.                                                        |
| `db.withRecursive(cte, ...)`                       | `db.withRecursive(cte, ...)`                       | Same.                                                        |
| `union/unionAll/intersect/except` helpers          | `union/unionAll/intersect/except` helpers          | Rado also supports `intersectAll`/`exceptAll` for PG/MySQL.  |

## Select Builder

| Drizzle API                        | Rado API                | Notes                                                      |
| ---------------------------------- | ----------------------- | ---------------------------------------------------------- |
| `.from(table                       | subquery                | sql)`                                                      | `.from(table                              | subquery | cte | sql)` | Rado supports tables, subqueries, CTEs, or raw SQL. |
| `.where(condition)`                | `.where(...conditions)` | Rado takes multiple conditions and ANDs them.              |
| `.groupBy(...exprs)`               | `.groupBy(...exprs)`    | Same.                                                      |
| `.having(condition)`               | `.having(condition)`    | Rado also allows `(selection) => condition`.               |
| `.orderBy(...exprs)`               | `.orderBy(...exprs)`    | Same.                                                      |
| `.limit(n)`                        | `.limit(n)`             | Same.                                                      |
| `.offset(n)`                       | `.offset(n)`            | Same.                                                      |
| `.innerJoin(table, on)`            | `.innerJoin(table, on)` | Same.                                                      |
| `.leftJoin(table, on)`             | `.leftJoin(table, on)`  | Same.                                                      |
| `.rightJoin(table, on)`            | `.rightJoin(table, on)` | Same.                                                      |
| `.fullJoin(table, on)`             | `.fullJoin(table, on)`  | Same.                                                      |
| `.crossJoin(table)`                | `.crossJoin(table, on)` | Rado requires an `on` even for cross joins.                |
| `.union(query)`                    | `.union(query)`         | Both support chaining.                                     |
| `.unionAll(query)`                 | `.unionAll(query)`      | Same.                                                      |
| `.intersect(query)`                | `.intersect(query)`     | Same.                                                      |
| `.except(query)`                   | `.except(query)`        | Same.                                                      |
| `.as('alias')` (subquery aliasing) | `.as('alias')`          | Rado supports `.as` on select/union queries.               |
| `$dynamic()`                       | `$dynamic()`            | Same intent: allow conditional chaining.                   |
| `.get()` / `.all()` (driver-level) | n/a                     | Rado executes via driver/query class, not a select method. |
| `.for('update'                     | 'share')`               | n/a                                                        | No row-lock clause in Rado query builder. |

## Insert Builder

| Drizzle API                              | Rado API                                 | Notes                                 |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------- |
| `.values(value                           | value[])`                                | `.values(value                        | value[])` | Same. |
| `.select(query)`                         | `.select(query)`                         | Insert-from-select supported in both. |
| `.returning()` / `.returning(selection)` | `.returning()` / `.returning(selection)` | PG/SQLite only in Rado.               |
| `.onConflictDoNothing()`                 | `.onConflictDoNothing()`                 | PG/SQLite only in Rado.               |
| `.onConflictDoUpdate({...})`             | `.onConflictDoUpdate({...})`             | PG/SQLite only in Rado.               |
| `.onDuplicateKeyUpdate({...})`           | `.onDuplicateKeyUpdate({...})`           | MySQL only in Rado.                   |

## Update Builder

| Drizzle API                              | Rado API                                 | Notes                                         |
| ---------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| `.set({...})`                            | `.set({...})`                            | Same.                                         |
| `.where(condition)`                      | `.where(...conditions)`                  | Rado takes multiple conditions and ANDs them. |
| `.returning()` / `.returning(selection)` | `.returning()` / `.returning(selection)` | PG/SQLite only in Rado.                       |
| `.orderBy(...exprs)`                     | `.orderBy(...exprs)`                     | Rado supports on update queries.              |
| `.limit(n)`                              | `.limit(n)`                              | Rado supports on update queries.              |
| `.offset(n)`                             | `.offset(n)`                             | Rado supports on update queries.              |

## Delete Builder

| Drizzle API                              | Rado API                                 | Notes                                         |
| ---------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| `.where(condition)`                      | `.where(...conditions)`                  | Rado takes multiple conditions and ANDs them. |
| `.returning()` / `.returning(selection)` | `.returning()` / `.returning(selection)` | PG/SQLite only in Rado.                       |
| `.orderBy(...exprs)`                     | `.orderBy(...exprs)`                     | Rado supports on delete queries.              |
| `.limit(n)`                              | `.limit(n)`                              | Rado supports on delete queries.              |
| `.offset(n)`                             | `.offset(n)`                             | Rado supports on delete queries.              |

## Expressions and Conditions

| Drizzle API                          | Rado API                             | Notes                        |
| ------------------------------------ | ------------------------------------ | ---------------------------- |
| `eq`, `ne`, `gt`, `gte`, `lt`, `lte` | `eq`, `ne`, `gt`, `gte`, `lt`, `lte` | Same.                        |
| `and`, `or`, `not`                   | `and`, `or`, `not`                   | Same.                        |
| `like`, `notLike`                    | `like`, `notLike`                    | Same.                        |
| `ilike`, `notIlike`                  | `ilike`, `notILike`                  | Rado uses `notILike` casing. |
| `inArray`, `notInArray`              | `inArray`, `notInArray`              | Same.                        |
| `isNull`, `isNotNull`                | `isNull`, `isNotNull`                | Same.                        |
| `between`, `notBetween`              | `between`, `notBetween`              | Same.                        |
| `asc`, `desc`                        | `asc`, `desc`                        | Same.                        |
| `exists`                             | `exists`                             | Same (accepts a select).     |

## Aggregates

| Drizzle API              | Rado API                 | Notes |
| ------------------------ | ------------------------ | ----- |
| `count`, `countDistinct` | `count`, `countDistinct` | Same. |
| `avg`, `avgDistinct`     | `avg`, `avgDistinct`     | Same. |
| `sum`, `sumDistinct`     | `sum`, `sumDistinct`     | Same. |
| `min`, `max`             | `min`, `max`             | Same. |

## SQL Helpers

| Drizzle API         | Rado API            | Notes                                     |
| ------------------- | ------------------- | ----------------------------------------- |
| `sql\`...\``        | `sql\`...\``        | Tagged template in both.                  |
| `sql.raw()`         | `sql.unsafe()`      | Rado uses `sql.unsafe` for raw fragments. |
| `sql.join()`        | `sql.join()`        | Same.                                     |
| `sql.identifier()`  | `sql.identifier()`  | Same.                                     |
| `sql.placeholder()` | `sql.placeholder()` | Same.                                     |
| `sql.empty()`       | `sql.empty()`       | Same.                                     |
| `sql.value()`       | `sql.value()`       | Same.                                     |
| `sql.inline()`      | `sql.inline()`      | Same.                                     |

## Column Types by Engine (Rado)

These are the full column helpers exposed by Rado per engine. Names generally
match Drizzle where available, but this list is Rado-specific and complete for
this codebase.

### MySQL (`src/mysql/columns.ts`)

- `bigint({mode?: 'number', unsigned?: boolean})`
- `binary({length?: number})`
- `boolean()`
- `blob()`
- `char({length?: number})`
- `date({mode?: 'date' | 'string'})`
- `datetime({mode?: 'string', fsp?: 0..6})`
- `decimal({precision?: number, scale?: number})`
- `float()`
- `integer()` / `int()`
- `json<T>()`
- `mediumint({unsigned?: boolean})`
- `real()`
- `serial()`
- `smallint({unsigned?: boolean})`
- `text()`
- `tinytext()`
- `mediumtext()`
- `longtext()`
- `time({fsp?: 0..6})`
- `timestamp({mode?: 'string', fsp?: 0..6})`
- `tinyint({unsigned?: boolean})`
- `varbinary({length?: number})`
- `varchar({length?: number})`
- `year()`

### Postgres (`src/postgres/columns.ts`)

- `bigint({mode?: 'number'})`
- `bigserial({mode?: 'number'})`
- `bit({dimensions?: number})`
- `boolean()`
- `bytea()`
- `char({length?: number})`
- `cidr()`
- `date({mode?: 'date' | 'string'})`
- `doublePrecision()`
- `geometry({type?: string, mode?: 'tuple' | 'xy'})`
- `inet()`
- `integer()` / `int()`
- `interval({fields?: IntervalFields, precision?: 0..6})`
- `json<T>()`
- `jsonb<T>()`
- `line({mode?: 'tuple' | 'abc'})`
- `macaddr()`
- `macaddr8()`
- `numeric({precision?: number, scale?: number})`
- `oid()`
- `point({mode?: 'tuple' | 'xy'})`
- `real()`
- `serial()`
- `sparsevec({dimensions: number})`
- `smallint()`
- `smallserial()`
- `text()`
- `halfvec({dimensions: number})`
- `time({precision?: 0..6, withTimeZone?: boolean})`
- `timestamp({mode?: 'string', precision?: 0..6, withTimeZone?: boolean})`
- `uuid()`
- `varbit({dimensions?: number})`
- `varchar({length: number})`
- `vector({dimensions: number})`

### SQLite (`src/sqlite/columns.ts`)

- `boolean()`
- `integer({mode?: 'boolean' | 'timestamp' | 'timestamp_ms' | 'number'})` / `int()`
- `blob({mode?: 'json' | 'bigint' | 'buffer'})`
- `text({mode?: 'text' | 'json', length?: number, enum?: string[]})`
- `real()`
- `numeric()`
- `json<T>()`
- `jsonb<T>()`

### Universal (`src/universal/columns.ts`)

- `id()`
- `text()`
- `varchar({length?: number})`
- `integer()`
- `number()`
- `boolean()`
- `json<T>()`
- `jsonb<T>()`
- `blob()`

## Missing for Full Drizzle Compatibility

- **Postgres column types:** `dataType().array(...)` is not present in Rado.
- **MySQL column types:** `double`, `bigserial`, and `mysqlEnum(...)` (plus enum options on text/char/varchar) are not present in Rado.
- **Enum typing on text types:** Drizzle supports enum inference on `text`/`varchar`/`char` across engines; Rado only covers this for SQLite `text(...)`.
- **Row locking:** Drizzle’s `select().for('update' | 'share' | ...)` is not available in Rado.
