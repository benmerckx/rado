import {Column, column} from './Column.ts'
import type {Database} from './Database.ts'
import {getTable} from './Internal.ts'
import type {Deliver, QueryMeta} from './MetaData.ts'
import {sql} from './Sql.ts'
import {table} from './Table.ts'
import {type Gen, exec} from './Transaction.ts'

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

// What each dialect does its own way
export interface Migrator {
  // Why a driver that runs one statement at a time can't migrate
  statements: string
  // Whether the current schema has a table or view of this name
  exists(db: Database, name: string): Gen<boolean>
  // Whether nothing is defined yet, for the shadow generate runs on
  empty(db: Database): Gen<boolean>
  // Runs apply under the dialect's lock and transaction. Partial is set
  // when a failing file leaves what ran before it.
  run(
    db: Database,
    apply: (tx: Database, partial: boolean) => Gen<Array<string>>
  ): Gen<Array<string>>
}

interface Migration {
  name: string
  sql: string
  checksum: string
}

function varchar(name: string, length: number): Column<string> {
  return new Column<string>({name, type: column.varchar(length)})
}

export const History = table('rado_migrations', {
  name: varchar('name', 255).primaryKey(),
  checksum: varchar('checksum', 16).notNull(),
  appliedAt: varchar('applied_at', 32).notNull()
})

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

// The migrations that haven't run, after checking the ones that have
function* check(
  db: Database,
  migrator: Migrator,
  migrations: Array<Migration>
): Gen<Array<Migration>> {
  const applied = (yield* migrator.exists(db, getTable(History).name))
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

// The message of an error and the one it wraps, D1 puts the reason there
function reason(error: unknown): string {
  const {message, cause} = error as Error
  return cause instanceof Error ? `${message}: ${cause.message}` : message
}

function* apply(
  db: Database,
  migrator: Migrator,
  migrations: Array<Migration>,
  baseline: string | undefined,
  partial: boolean
): Gen<Array<string>> {
  yield db.run(getTable(History).createTable(undefined, true))
  // Checked again under the lock, another process may have run them
  const pending = yield* check(db, migrator, migrations)
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
      const note = partial ? ' and may be partially applied' : ''
      throw new Error(`Migration ${m.name} failed${note}: ${reason(error)}`, {
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
  migrator: Migrator,
  migrations: Array<Migration>,
  options: MigrateOptions
): Gen<Array<string>> {
  if (db.driver.multipleStatements === false)
    throw new Error(migrator.statements)
  const baseline = options.baseline && named(options.baseline)
  if (baseline && !migrations.some(m => m.name === baseline))
    throw new Error(`Unknown baseline ${baseline}`)
  // Nothing to run, so no lock and, on SQLite, no foreign key checks
  if ((yield* check(db, migrator, migrations)).length === 0) return []
  const go = (tx: Database, partial: boolean) =>
    apply(tx, migrator, migrations, baseline, partial)
  if (!db.driver.supportsTransactions) return yield* go(db, true)
  return yield* migrator.run(db, go)
}

function* pending(
  db: Database,
  migrator: Migrator,
  migrations: Array<Migration>
): Gen<Array<string>> {
  return (yield* check(db, migrator, migrations)).map(m => m.name)
}

export function createMigrate(pick: (db: Database) => Migrator): Migrate {
  return Object.assign(
    (db: Database, migrations: Migrations, options: MigrateOptions = {}) =>
      exec(run(db, pick(db), list(migrations), options)),
    {
      pending: (db: Database, migrations: Migrations) =>
        exec(pending(db, pick(db), list(migrations)))
    }
  ) as Migrate
}
