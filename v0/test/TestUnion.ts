import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {select, withRecursive} from '../src/index.js'
import {date} from '../src/sqlite.js'
import {connect} from './DbSuite.js'

const db = await connect()

test('union', async () => {
  const res = await select(1).union(select(2)).union(select(2)).on(db)
  assert.equal(res, [1, 2])
})

test('union all', async () => {
  const res = await select(1).unionAll(select(2)).unionAll(select(2)).on(db)
  assert.equal(res, [1, 2, 2])
})

test('except', async () => {
  const res = await select(1).union(select(2)).except(select(2)).on(db)
  assert.equal(res, [1])
})

test('intersect', async () => {
  const res = await select(1).union(select(2)).intersect(select(2)).on(db)
  assert.equal(res, [2])
})

test('recursive union', async () => {
  const startDay = '2021-01-01'
  const endDay = '2021-01-04'
  const days = withRecursive(select({day: startDay})).unionAll(() =>
    days(days.day.isLess(endDay)).select({day: date(days.day, '+1 day')})
  )
  const res = await db(days().select(days.day))
  assert.equal(res, ['2021-01-01', '2021-01-02', '2021-01-03', '2021-01-04'])
})

test('count some numbers', async () => {
  const cnt = withRecursive(select({x: 1})).unionAll(() =>
    select({x: cnt.x.add(1)})
      .from(cnt)
      .take(10)
  )
  const numbers = await db(cnt().select(cnt.x))
  assert.equal(numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
})

test.run()
