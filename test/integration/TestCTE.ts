import {lte, sql, type Database} from '@/index.ts'
import type {DefineTest} from '@benmerckx/suite'

export async function testCTE(db: Database, test: DefineTest) {
  const fibonacci = db.$with('fibonacci').as(
    db.select({n: sql<number>`1`, next: sql<number>`1`}).unionAll(self =>
      db
        .select({
          n: self.next,
          next: sql<number>`${self.n} + ${self.next}`
        })
        .from(self)
        .where(lte(self.next, 13))
    )
  )
  const query = db.withRecursive(fibonacci).select(fibonacci.n).from(fibonacci)
  const result = await query.all()
  test.equal(result, [1, 1, 2, 3, 5, 8, 13])
}
