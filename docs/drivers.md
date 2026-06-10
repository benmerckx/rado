# Drivers

Rado doesn't talk to your database directly. It wraps a client you provide.
Each supported client has a thin driver under `rado/driver/*` exporting a
`connect` function. You hand it a client instance, it hands you a typed
database.

| Database   | Package                                                                            | Import                       | Sync/async |
| ---------- | ---------------------------------------------------------------------------------- | ---------------------------- | ---------- |
| PostgreSQL | [pg](https://www.npmjs.com/package/pg)                                             | `rado/driver/pg`             | async      |
| PostgreSQL | [@electric-sql/pglite](https://www.npmjs.com/package/@electric-sql/pglite)         | `rado/driver/pglite`         | async      |
| PostgreSQL | [@neondatabase/serverless](https://www.npmjs.com/package/@neondatabase/serverless) | `rado/driver/pg`             | async      |
| PostgreSQL | [@vercel/postgres](https://www.npmjs.com/package/@vercel/postgres)                 | `rado/driver/pg`             | async      |
| SQLite     | [better-sqlite3](https://www.npmjs.com/package/better-sqlite3)                     | `rado/driver/better-sqlite3` | sync       |
| SQLite     | `bun:sqlite` (built into Bun)                                                      | `rado/driver/bun-sqlite`     | sync       |
| SQLite     | [sql.js](https://www.npmjs.com/package/sql.js)                                     | `rado/driver/sql.js`         | sync       |
| SQLite     | [@libsql/client](https://www.npmjs.com/package/@libsql/client)                     | `rado/driver/libsql`         | async      |
| SQLite     | Cloudflare D1                                                                      | `rado/driver/d1`             | async      |
| MySQL      | [mysql2](https://www.npmjs.com/package/mysql2)                                     | `rado/driver/mysql2`         | async      |

## Sync vs async databases

Drivers that operate synchronously (better-sqlite3,
`bun:sqlite`, sql.js) produce a `SyncDatabase`: query results are available
immediately, no event loop round-trips.

```ts
// Synchronous driver: results, right now
const users = db.select().from(User).all()
const first = db.select().from(User).get()

// ...but awaiting also works, queries are thenable
const same = await db.select().from(User)
```

Async drivers produce an `AsyncDatabase`, where queries must be awaited. The
type system keeps track for you. `db.transaction` callbacks, `.all()`,
`.get()` and friends are typed sync or async to match the driver.

## PostgreSQL

### pg

```ts
import {Pool} from 'pg'
import {connect} from 'rado/driver/pg'

const db = connect(new Pool({connectionString: process.env.DATABASE_URL}))
```

`connect` accepts a `Client`, `Pool` or `PoolClient`.

### PGlite

Postgres compiled to WASM runs in Node.js and the browser. It works well for
tests and local-first apps.

```ts
import {PGlite} from '@electric-sql/pglite'
import {connect} from 'rado/driver/pglite'

const db = connect(new PGlite()) // in-memory, or pass a data directory
```

### Neon / Vercel Postgres

Both expose a pg-compatible pool, so they use the pg driver:

```ts
import {Pool} from '@neondatabase/serverless'
import {connect} from 'rado/driver/pg'

const db = connect(new Pool({connectionString: process.env.DATABASE_URL}))
```

```ts
import {createPool} from '@vercel/postgres'
import {connect} from 'rado/driver/pg'

const db = connect(createPool())
```

## SQLite

### better-sqlite3 (Node.js, sync)

```ts
import Database from 'better-sqlite3'
import {connect} from 'rado/driver/better-sqlite3'

const db = connect(new Database('app.db'))
```

### bun:sqlite (Bun, sync)

```ts
import {Database} from 'bun:sqlite'
import {connect} from 'rado/driver/bun-sqlite'

const db = connect(new Database('app.db'))
```

### sql.js (anywhere WASM runs, sync)

```ts
import initSqlJs from 'sql.js'
import {connect} from 'rado/driver/sql.js'

const {Database} = await initSqlJs()
const db = connect(new Database())
```

### libSQL / Turso (async)

```ts
import {createClient} from '@libsql/client'
import {connect} from 'rado/driver/libsql'

const db = connect(
  createClient({url: 'libsql://your-db.turso.io', authToken: '...'})
)
```

### Cloudflare D1 (async)

```ts
import {connect} from 'rado/driver/d1'

export default {
  async fetch(request: Request, env: Env) {
    const db = connect(env.DB)
    // ...
  }
}
```

Note: D1 does not support interactive transactions, so `db.transaction` is
unavailable. Use [`db.batch`](runtime/transactions-and-batch.md#batch) instead,
which D1 executes atomically.

## MySQL

### mysql2 (async)

```ts
import {createConnection} from 'mysql2'
import {connect} from 'rado/driver/mysql2'

const db = connect(createConnection({uri: process.env.DATABASE_URL}))
```

Both callback-style and promise-style mysql2 connections are accepted.

## One import to rule them all

If you prefer, `rado/driver` re-exports every connect function keyed by
package name:

```ts
import {connect} from 'rado/driver'

const db = connect['better-sqlite3'](new Database('app.db'))
```

Handy when the driver choice itself is dynamic.

## What the driver determines

- **Dialect**: which SQL gets emitted (quoting, parameter style, type names)
- **Sync or async**: whether results need `await`
- **JSON handling**: drivers that parse JSON natively (pg, pglite, mysql2)
  are handled transparently; SQLite drivers receive JSON as text and rado
  parses it for you
- **Available features**: e.g. `returning` exists on PostgreSQL and SQLite
  but not MySQL; the types only offer what your dialect supports
