import {count, type Database} from '@/index.ts'
import type {DefineTest} from '@benmerckx/suite'
import {txGenerator} from '../../src/universal.ts'
import {Node} from './schema.ts'

export function testTransactions(db: Database, test: DefineTest) {
  test('transactions', async () => {
    try {
      await db.create(Node)
      await Promise.allSettled([
        db.transaction(async tx => {
          await tx.insert(Node).values({
            textField: 'hello',
            bool: true
          })
          const nodes = await tx.select().from(Node)
          test.equal(nodes, [{id: 1, textField: 'hello', bool: true}])
          tx.rollback()
        }),
        db.transaction(async tx => {
          await tx.insert(Node).values({
            textField: 'hello1',
            bool: true
          })
          const nodes = await tx.select(count()).from(Node).get()
          test.equal(nodes, 1)
          tx.rollback()
        })
      ])
    } catch (err) {
      test.equal((<Error>err).message, 'Rollback')
      const nodes = await db.select().from(Node)
      test.equal(nodes, [])
    } finally {
      await db.drop(Node)
    }
  })

  test('generator transactions', async () => {
    const result = await db.transaction(
      txGenerator(function* (tx) {
        yield* tx.create(Node)
        yield* tx.insert(Node).values({
          textField: 'hello',
          bool: true
        })
        const nodes = yield* tx.select().from(Node)
        test.equal(nodes, [{id: 1, textField: 'hello', bool: true}])
        yield* tx.drop(Node)
        return 1
      })
    )
    test.equal(result, 1)
  })
}
