import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {Expr, column, table} from '../src'
import {connect} from './DbSuite'

const Node = table({
  name: 'node',
  columns: {
    id: column.integer().primaryKey<'node'>(),
    index: column.integer()
  }
})

test('prepare', async () => {
  const query = await connect()
  await query(Node.createTable())
  const amount = 10
  const objects = Array.from({length: amount}).map((_, i) => ({index: i}))
  const insert = query.prepare((index: Expr<number>) => {
    return Node.insertAll([{index}])
  })
  for (const object of objects) {
    await insert(object.index)
  }
  const total = await query(Node.count())
  assert.is(amount, total)
})

test.run()
