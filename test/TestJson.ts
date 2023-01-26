import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {Cursor, Expr, column, table} from '../src/index'
import {connect} from './DbSuite'

const Node = table({
  name: 'node',
  columns: {
    id: column.integer().primaryKey<'node'>(),
    index: column.integer()
  }
})

test('json', async () => {
  const query = await connect()
  await query(Node.createTable())
  const amount = 10
  const objects = Array.from({length: amount}).map((_, i) => ({index: i}))
  assert.is(objects.length, amount)
  await query(Node.insertAll(objects))
  const count = await query(Node.count())
  assert.is(count, amount)
  const q = Node.first()
    .select({
      fieldA: Expr.value(12),
      fieldB: Node.index
    })
    .where(Node.index.is(1))
  const res1 = await query(q)!
  assert.is(res1.fieldA, 12)
  assert.is(res1.fieldB, 1)
  const res2: typeof res1 = await query(new Cursor(q.toJSON()))!
  assert.is(res2.fieldA, 12)
  assert.is(res2.fieldB, 1)
})

test.run()
