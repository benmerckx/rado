import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {select} from '../src/index'
import {date} from '../src/sqlite'
import {connect} from './DbSuite'

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
  const endDay = '2021-01-03'
  const query = select({day: startDay}).recursiveUnion(({days}) =>
    days()
      .select({day: date(days.day, '+1 day')})
      .where(days.day.isLess(endDay))
  )
  const res = await db(query)
  assert.equal(res, [
    {day: '2021-01-01'},
    {day: '2021-01-02'},
    {day: '2021-01-03'}
  ])
})

test.run()
