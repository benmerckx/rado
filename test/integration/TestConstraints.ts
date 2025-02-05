import type {Database} from '@/index.ts'
import type {DefineTest} from '@alinea/suite'
import {TableA, TableB} from './schema.ts'

export function testConstraints(db: Database, test: DefineTest) {
  test('constraints', async () => {
    await db.create(TableA, TableB)
    try {
      await db.insert(TableA).values({})
      await db.insert(TableB).values({
        isUnique: 1,
        hasRef: 1,
        colA: 1,
        colB: 1
      })
      const [row] = await db.select().from(TableB)
      test.equal(row, {
        isUnique: 1,
        hasRef: 1,
        colA: 1,
        colB: 1
      })
    } finally {
      await db.drop(TableB, TableA)
    }
  })
}
