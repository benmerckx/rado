import {suite} from '@alinea/suite'
import {AsyncDatabase, SyncDatabase} from '#/core/Database.ts'
import type {
  AsyncDriver,
  AsyncStatement,
  SyncDriver,
  SyncStatement
} from '#/core/Driver.ts'
import {sql} from '#/core/Sql.ts'
import {temporaryTable} from '#/core/Table.ts'
import {integer} from '#/sqlite/columns.ts'
import {sqliteDialect} from '#/sqlite/dialect.ts'

const test = suite(import.meta)

test('database frees direct statements after success and failure', () => {
  let freeCount = 0
  let failure: Error | undefined
  const statement = (): SyncStatement => ({
    all: () => {
      if (failure) throw failure
      return []
    },
    get: () => {
      if (failure) throw failure
      return null
    },
    run: () => ({affectedRows: 0}),
    values: () => [],
    [Symbol.dispose]: () => freeCount++
  })
  const driver: SyncDriver = {
    parsesJson: false,
    supportsTransactions: true,
    close() {},
    exec() {},
    prepare: statement,
    transaction: run => run(driver),
    batch: () => []
  }
  const db = new SyncDatabase(driver, sqliteDialect, undefined!)

  const Scratch = temporaryTable('Scratch', {id: integer()})
  test.throws(() => db.migrate(Scratch), /Temporary tables cannot be migrated/)

  test.equal(db.get(sql`select 1`), null)
  test.equal(db.all(sql`select 1`), [])
  test.equal(freeCount, 2)

  failure = new Error('query failed')
  test.throws(() => db.get(sql`select 1`))
  test.throws(() => db.all(sql`select 1`))
  test.equal(freeCount, 4)
})

test('database frees asynchronous direct statements after success and failure', async () => {
  let freeCount = 0
  let failure: Error | undefined
  const statement = (): AsyncStatement => ({
    all: async () => {
      if (failure) throw failure
      return []
    },
    get: async () => {
      if (failure) throw failure
      return null
    },
    run: async () => ({affectedRows: 0}),
    values: async () => [],
    async [Symbol.asyncDispose]() {
      freeCount++
    }
  })
  const driver: AsyncDriver = {
    parsesJson: false,
    supportsTransactions: true,
    async close() {},
    async exec() {},
    prepare: statement,
    transaction: run => run(driver),
    async batch() {
      return []
    }
  }
  const db = new AsyncDatabase(driver, sqliteDialect, undefined!)

  test.equal(await db.get(sql`select 1`), null)
  test.equal(await db.all(sql`select 1`), [])
  test.equal(freeCount, 2)

  failure = new Error('query failed')
  for (const query of [db.get(sql`select 1`), db.all(sql`select 1`)]) {
    let caught: unknown
    try {
      await query
    } catch (error) {
      caught = error
    }
    test.equal(caught, failure)
  }
  test.equal(freeCount, 4)
})
