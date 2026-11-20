import type {DefineTest} from '@alinea/suite'
import {
  type Database,
  and,
  asc,
  between,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  notBetween,
  notInArray,
  notLike,
  or,
  sql,
  table,
  when
} from '#/index.ts'
import * as column from '#/universal/columns.ts'

const Item = table('Item', {
  id: column.id(),
  name: column.text().notNull(),
  size: column.integer()
})

export function testConditions(db: Database, test: DefineTest) {
  async function names(...where: Array<any>) {
    return db
      .select(Item.name)
      .from(Item)
      .where(...where)
      .orderBy(asc(Item.id))
  }

  async function withItems(run: () => Promise<void>) {
    await db.create(Item)
    try {
      await db.insert(Item).values([
        {name: 'apple', size: 1},
        {name: 'banana', size: 2},
        {name: 'cherry', size: 3},
        {name: 'date', size: null}
      ])
      await run()
    } finally {
      await db.drop(Item)
    }
  }

  test('comparisons', () =>
    withItems(async () => {
      test.equal(await names(ne(Item.size, 2)), ['apple', 'cherry'])
      test.equal(await names(gt(Item.size, 2)), ['cherry'])
      test.equal(await names(gte(Item.size, 2)), ['banana', 'cherry'])
      test.equal(await names(lt(Item.size, 2)), ['apple'])
      test.equal(await names(lte(Item.size, 2)), ['apple', 'banana'])
      test.equal(await names(between(Item.size, 2, 3)), ['banana', 'cherry'])
      test.equal(await names(notBetween(Item.size, 2, 3)), ['apple'])
    }))

  test('null checks', () =>
    withItems(async () => {
      test.equal(await names(isNull(Item.size)), ['date'])
      test.equal(await names(isNotNull(Item.size)), [
        'apple',
        'banana',
        'cherry'
      ])
      test.equal(await names(eq(Item.size, null as any)), [])
    }))

  test('like', () =>
    withItems(async () => {
      test.equal(await names(like(Item.name, '%an%')), ['banana'])
      test.equal(await names(notLike(Item.name, '%a%')), ['cherry'])
    }))

  test('in array', () =>
    withItems(async () => {
      test.equal(await names(inArray(Item.size, [1, 3])), ['apple', 'cherry'])
      test.equal(await names(notInArray(Item.size, [1, 3])), ['banana'])
      test.equal(await names(inArray(Item.size, [])), [])
      test.equal(await names(notInArray(Item.size, [])), [
        'apple',
        'banana',
        'cherry',
        'date'
      ])
      const small = db.select(Item.size).from(Item).where(lt(Item.size, 3))
      test.equal(await names(inArray(Item.size, small)), ['apple', 'banana'])
    }))

  test('and, or, not', () =>
    withItems(async () => {
      test.equal(await names(or(eq(Item.size, 1), eq(Item.name, 'date'))), [
        'apple',
        'date'
      ])
      test.equal(
        await names(and(gt(Item.size, 1), not(eq(Item.name, 'cherry')))),
        ['banana']
      )
      test.equal(await names(and()), ['apple', 'banana', 'cherry', 'date'])
    }))

  test('conditions as values', () =>
    withItems(async () => {
      const rows = await db
        .select({big: gt(Item.size, 1), missing: isNull(Item.size)})
        .from(Item)
        .orderBy(asc(Item.id))
      test.equal(rows, [
        {big: false, missing: false},
        {big: true, missing: false},
        {big: true, missing: false},
        {big: null, missing: true}
      ])
    }))

  test('when', () =>
    withItems(async () => {
      const label = await db
        .select(
          when<string>(
            [lt(Item.size, 2), sql.value('small')],
            [isNull(Item.size), sql.value('none')],
            sql.value('large')
          )
        )
        .from(Item)
        .orderBy(asc(Item.id))
      test.equal(label, ['small', 'large', 'large', 'none'])
      const compared = await db
        .select(when(Item.size, [1, sql.value('one')], [2, sql.value('two')]))
        .from(Item)
        .orderBy(asc(Item.id))
      test.equal(compared, ['one', 'two', null, null])
    }))
}
