import type {DefineTest} from '@alinea/suite'
import {type Database, asc, lte, gte, table} from '#/index.ts'
import * as column from '#/universal/columns.ts'

const Num = table('Num', {
  id: column.id(),
  value: column.integer().notNull()
})

export function testSetOperations(db: Database, test: DefineTest) {
  async function withNums(run: () => Promise<void>) {
    await db.create(Num)
    try {
      await db.insert(Num).values([1, 2, 2, 3, 4].map(value => ({value})))
      await run()
    } finally {
      await db.drop(Num)
    }
  }

  const low = () => db.select(Num.value).from(Num).where(lte(Num.value, 2))
  const high = () => db.select(Num.value).from(Num).where(gte(Num.value, 2))
  const sorted = (values: Array<number>) => values.toSorted((a, b) => a - b)

  test('union', () =>
    withNums(async () => {
      test.equal(sorted(await low().union(high())), [1, 2, 3, 4])
      test.equal(sorted(await low().unionAll(high())), [1, 2, 2, 2, 2, 3, 4])
    }))

  test('intersect and except', () =>
    withNums(async () => {
      test.equal(sorted(await low().intersect(high())), [2])
      test.equal(sorted(await low().except(high())), [1])
      if (db.dialect.runtime === 'sqlite') return
      const all = low() as any
      test.equal(sorted(await all.intersectAll(high())), [2, 2])
      test.equal(sorted(await all.exceptAll(high())), [1])
    }))

  test('ordered union with limit', () =>
    withNums(async () => {
      const values = await low()
        .union(high())
        .orderBy(asc(Num.value))
        .limit(2)
        .offset(1)
      test.equal(values, [2, 3])
    }))
}
