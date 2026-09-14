import {suite} from '@alinea/suite'
import type {
  AsyncDriver,
  AsyncStatement,
  BatchedQuery,
  SyncDriver,
  SyncStatement
} from '#/core/Driver.ts'
import {executeBatch} from '#/driver/batch.ts'

const test = suite(import.meta)

const queries: Array<BatchedQuery> = [
  {sql: 'first', params: [1], isSelection: true},
  {sql: 'second', params: [2], isSelection: false}
]

test('sync batches free owned statements after success and failure', () => {
  const freed: Array<string> = []
  const driver = {
    prepare(sql: string): SyncStatement {
      return {
        all: () => [],
        get: () => null,
        run: () => ({affectedRows: 0}),
        values: params => {
          if (sql === 'fail') throw new Error('query failed')
          return [[sql, ...params]]
        },
        free: () => freed.push(sql)
      }
    }
  } as SyncDriver

  test.equal(executeBatch(driver, queries), [[['first', 1]], [['second', 2]]])
  test.equal(freed, ['first', 'second'])

  test.throws(() =>
    executeBatch(driver, [
      queries[0],
      {sql: 'fail', params: [], isSelection: false}
    ])
  )
  test.equal(freed, ['first', 'second', 'first', 'fail'])
})

test('async batches free owned statements after success and failure', async () => {
  const freed: Array<string> = []
  const driver = {
    prepare(sql: string): AsyncStatement {
      return {
        all: async () => [],
        get: async () => null,
        run: async () => ({affectedRows: 0}),
        values: async params => {
          if (sql === 'fail') throw new Error('query failed')
          return [[sql, ...params]]
        },
        free: () => freed.push(sql)
      }
    }
  } as AsyncDriver

  test.equal(await executeBatch(driver, queries), [
    [['first', 1]],
    [['second', 2]]
  ])
  test.equal(freed, ['first', 'second'])

  let caught: unknown
  try {
    await executeBatch(driver, [
      queries[0],
      {sql: 'fail', params: [], isSelection: false}
    ])
  } catch (error) {
    caught = error
  }
  test.ok(caught instanceof Error)
  test.equal(freed, ['first', 'second', 'first', 'fail'])
})
