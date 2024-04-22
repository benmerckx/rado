import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, table} from '../src/index.js'
import {connect} from './DbSuite.js'

const Node = table({
  Node: {
    id: column.integer().primaryKey<'node'>(),
    value: column.string()
  }
})

test('order by x collate nocase', async () => {
  const query = await connect()
  await query(Node().create())
  await query(Node().insertAll([{value: 'a'}, {value: 'B'}, {value: 'c'}]))
  const res = await query(Node().orderBy(Node.value.collate('NOCASE')))
  assert.equal(
    res.map(r => r.value),
    ['a', 'B', 'c']
  )
})

test.run()
