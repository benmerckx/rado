import type {DefineTest} from '@alinea/suite'
import {
  type Database,
  asc,
  avg,
  count,
  countDistinct,
  desc,
  gt,
  max,
  min,
  sum,
  table
} from '#/index.ts'
import * as column from '#/universal/columns.ts'

const Sale = table('Sale', {
  id: column.id(),
  region: column.text().notNull(),
  amount: column.integer(),
  price: column.number()
})

export function testAggregates(db: Database, test: DefineTest) {
  async function withSales(run: () => Promise<void>) {
    await db.create(Sale)
    try {
      await db.insert(Sale).values([
        {region: 'north', amount: 1, price: 1.5},
        {region: 'north', amount: 2, price: 2.5},
        {region: 'south', amount: 2, price: 3},
        {region: 'south', amount: null, price: null},
        {region: 'west', amount: 10, price: 0.25}
      ])
      await run()
    } finally {
      await db.drop(Sale)
    }
  }

  test('aggregates', () =>
    withSales(async () => {
      const row = await db
        .select({
          all: count(),
          amounts: count(Sale.amount),
          distinct: countDistinct(Sale.amount),
          sum: sum(Sale.amount),
          avg: avg(Sale.amount),
          min: min(Sale.amount),
          max: max(Sale.amount),
          maxPrice: max(Sale.price)
        })
        .from(Sale)
        .get()
      test.equal(row && {...row, avg: Number(row.avg)}, {
        all: 5,
        amounts: 4,
        distinct: 3,
        sum: '15',
        avg: 3.75,
        min: 1,
        max: 10,
        maxPrice: 3
      })
    }))

  test('aggregates over no rows', () =>
    withSales(async () => {
      const row = await db
        .select({
          all: count(),
          sum: sum(Sale.amount),
          avg: avg(Sale.amount),
          max: max(Sale.amount)
        })
        .from(Sale)
        .where(gt(Sale.amount, 100))
        .get()
      test.equal(row, {all: 0, sum: null, avg: null, max: null})
    }))

  test('group by and having', () =>
    withSales(async () => {
      const rows = await db
        .select({region: Sale.region, total: count()})
        .from(Sale)
        .groupBy(Sale.region)
        .having(gt(count(), 1))
        .orderBy(asc(Sale.region))
      test.equal(rows, [
        {region: 'north', total: 2},
        {region: 'south', total: 2}
      ])
    }))

  test('order by aggregate', () =>
    withSales(async () => {
      const regions = await db
        .select(Sale.region)
        .from(Sale)
        .groupBy(Sale.region)
        .orderBy(desc(sum(Sale.amount)), asc(Sale.region))
      test.equal(regions, ['west', 'north', 'south'])
    }))

  test('select distinct', () =>
    withSales(async () => {
      const regions = await db
        .selectDistinct(Sale.region)
        .from(Sale)
        .orderBy(asc(Sale.region))
      test.equal(regions, ['north', 'south', 'west'])
    }))
}
