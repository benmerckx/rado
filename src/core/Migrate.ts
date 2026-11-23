import {Master as master} from '../sqlite/catalog.ts'
import {unenforced} from '../sqlite/keys.ts'
import {varchar} from '../universal/columns.ts'
import type {Database} from './Database.ts'
import {eq, inArray, notLike} from './expr/Conditions.ts'
import {getTable} from './Internal.ts'
import type {Deliver, QueryMeta} from './MetaData.ts'
import {schema} from './Schema.ts'
import {sql} from './Sql.ts'
import {table} from './Table.ts'
import {type Gen, exec, result, transaction} from './Transaction.ts'

// File name to sql, the shape import.meta.glob returns
export type Migrations = Record<string, string>

export interface MigrateOptions {
  // Marks every migration up to and including this one as applied, on an
  // empty history
  baseline?: string
}

export interface Migrate {
  <Meta extends QueryMeta>(
    db: Database<Meta>,
    migrations: Migrations,
    options?: MigrateOptions
  ): Deliver<Meta, Array<string>>
  pending<Meta extends QueryMeta>(
    db: Database<Meta>,
    migrations: Migrations
  ): Deliver<Meta, Array<string>>
}

interface Migration {
  name: string
  sql: string
  checksum: string
}

const Master = master('main', 'sqlite_master')

const History = table('rado_migrations', {
  name: varchar('name', {length: 255}).primaryKey(),
  checksum: varchar('checksum', {length: 16}).notNull(),
  appliedAt: varchar('applied_at', {length: 32}).notNull()
})

const Tables = schema('information_schema').table('tables', {
  table_schema: varchar().notNull(),
  table_name: varchar().notNull()
})

// Pins the lock to this run, the key is "rado" in ascii
const key = 0x7261646f

// cyrb53, small and sync, line endings are normalized so a checkout with
// crlf doesn't count as a change
export function checksum(text: string): string {
  const input = text.replace(/\r\n/g, '\n')
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

// The file name without its directory and extension
function named(file: string): string {
  return file
    .split(/[\\/]/)
    .at(-1)!
    .replace(/\.sql$/, '')
}

export function list(migrations: Migrations): Array<Migration> {
  const result = Object.entries(migrations).map(([file, sql]) => ({
    name: named(file),
    sql,
    checksum: checksum(sql)
  }))
  const names = result.map(m => m.name)
  const twice = names.find((name, i) => names.indexOf(name) !== i)
  if (twice) throw new Error(`Migration ${twice} is defined twice`)
  return result.toSorted((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  )
}

// Tables and views in the current schema, or the one named
export function* objects(db: Database, name?: string): Gen<Array<string>> {
  if (db.dialect.runtime === 'sqlite')
    return yield* db
      .select(Master.name)
      .from(Master)
      .where(
        inArray(Master.type, ['table', 'view']),
        name ? eq(Master.name, name) : notLike(Master.name, 'sqlite_%')
      )
  const current = sql.universal<string>({
    postgres: sql`current_schema()`,
    mysql: sql`database()`
  })
  return yield* db
    .select(Tables.table_name)
    .from(Tables)
    .where(
      eq(Tables.table_schema, current),
      name ? eq(Tables.table_name, name) : undefined
    )
}

// The migrations that haven't run, after checking the ones that have
function* check(
  db: Database,
  migrations: Array<Migration>
): Gen<Array<Migration>> {
  const applied = (yield* objects(db, getTable(History).name)).length
    ? yield* db.select(History).from(History)
    : []
  for (const row of applied) {
    const migration = migrations.find(m => m.name === row.name)
    if (!migration)
      throw new Error(`Migration ${row.name} was applied but is missing`)
    if (migration.checksum !== row.checksum)
      throw new Error(`Migration ${row.name} changed after it was applied`)
  }
  return migrations.filter(m => !applied.some(row => row.name === m.name))
}

function* apply(
  db: Database,
  migrations: Array<Migration>,
  options: MigrateOptions,
  partial: boolean
): Gen<Array<string>> {
  yield db.run(getTable(History).createTable(undefined, true))
  const pending = yield* check(db, migrations)
  const baseline = options.baseline && named(options.baseline)
  if (baseline && !migrations.some(m => m.name === baseline))
    throw new Error(`Unknown baseline ${baseline}`)
  // Only an empty history takes a baseline, so it can stay in place
  const marked =
    baseline && pending.length === migrations.length
      ? pending.filter(m => m.name <= baseline)
      : []
  for (const m of marked) yield record(db, m)
  const ran: Array<string> = []
  for (const m of pending.filter(m => !marked.includes(m))) {
    try {
      if (m.sql.trim()) yield db.run(sql.unsafe(m.sql))
    } catch (error) {
      const reason = (error as Error).message
      const note = partial ? ' and may be partially applied' : ''
      throw new Error(`Migration ${m.name} failed${note}: ${reason}`, {
        cause: error
      })
    }
    yield record(db, m)
    ran.push(m.name)
  }
  return ran
}

function record(db: Database, {name, checksum}: Migration) {
  const appliedAt = new Date().toISOString()
  return db.insert(History).values({name, checksum, appliedAt}).run()
}

function* run(
  db: Database,
  migrations: Array<Migration>,
  options: MigrateOptions
): Gen<Array<string>> {
  if (db.driver.multipleStatements === false)
    throw new Error(
      db.dialect.runtime === 'mysql'
        ? 'Migrations need multipleStatements: true'
        : 'Migrate over the websocket Pool, Neon HTTP runs one statement per query'
    )
  if (!db.driver.supportsTransactions)
    return yield* apply(db, migrations, options, true)
  switch (db.dialect.runtime) {
    case 'sqlite':
      return yield* sqlite(db, migrations, options)
    case 'postgres':
      return yield* result(
        transaction(db, function* (tx) {
          yield* tx.select(sql`pg_advisory_xact_lock(${sql.inline(key)})`)
          return yield* apply(tx, migrations, options, false)
        })
      )
    case 'mysql':
      return yield* mysql(db, migrations, options)
  }
}

// Keys are off while the files run, so a rebuilt table doesn't cascade to
// the rows that reference it
function sqlite(
  db: Database,
  migrations: Array<Migration>,
  options: MigrateOptions
): Gen<Array<string>> {
  return unenforced(db, 'Migrations', function* (tx, {locked, always}) {
    if (locked && !always)
      throw new Error('Cannot migrate with foreign keys enforced')
    return yield* apply(tx, migrations, options, false)
  })
}

// DDL commits implicitly, so each file is recorded as soon as it ran and the
// transaction only holds one connection for the lock
function* mysql(
  db: Database,
  migrations: Array<Migration>,
  options: MigrateOptions
): Gen<Array<string>> {
  try {
    // Fails while a transaction is open, else it only sets the default
    yield db.run(sql`set transaction read write`)
  } catch {
    throw new Error('Cannot migrate inside a MySQL transaction')
  }
  // Lock names are server wide, at most 64 characters
  const name = sql`left(concat('rado_migrations.', database()), 64)`
  return yield* result(
    transaction(db, function* (tx) {
      yield tx.run(sql`commit`)
      const [locked] = yield* tx.select(sql<unknown>`get_lock(${name}, -1)`)
      if (Number(locked) !== 1) throw new Error('Cannot lock migrations')
      try {
        return yield* apply(tx, migrations, options, true)
      } finally {
        // The lock goes with the connection anyway, an error here would hide
        // the one that ended the run
        try {
          yield* tx.select(sql`release_lock(${name})`)
        } catch {}
      }
    })
  )
}

function* pending(
  db: Database,
  migrations: Array<Migration>
): Gen<Array<string>> {
  return (yield* check(db, migrations)).map(m => m.name)
}

export const migrate: Migrate = Object.assign(
  (db: Database, migrations: Migrations, options: MigrateOptions = {}) =>
    exec(run(db, list(migrations), options)),
  {
    pending: (db: Database, migrations: Migrations) =>
      exec(pending(db, list(migrations)))
  }
) as Migrate
