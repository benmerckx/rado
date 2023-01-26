import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {Expr, column, table} from '../src/index'
import {connect} from './DbSuite'

const Node = table({
  name: 'node',
  columns: {
    id: column.integer().primaryKey<'node'>(),
    index: column.integer()
  }
})

test('prepare', async () => {
  const db = await connect()
  await Node.createTable().run(db)
  const amount = 10
  const objects = Array.from({length: amount}).map((_, i) => ({index: i}))
  const insert = db.prepare((index: Expr<number>) => {
    return Node.insertAll([{index}])
  })
  for (const object of objects) {
    await insert(object.index)
  }
  const total = await Node.count().run(db)
  assert.is(amount, total)
})

test.run()
