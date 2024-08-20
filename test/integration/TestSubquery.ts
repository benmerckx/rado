import {type Database, exists, inArray, sql} from '@/index.ts'
import type {DefineTest} from '@benmerckx/suite'

export async function testSubquery(db: Database, test: DefineTest) {
  const inner = db.select(sql<number>`1`.as('number'))
  const named = inner.as('named')
  const result = await db
    .select({
      contains: inArray(1, inner),
      exists: exists(inner),
      value: inner,
      named: named
    })
    .from(named)
    .get()
  test.equal(result, {
    contains: true,
    exists: true,
    value: 1,
    named: 1
  })
}
