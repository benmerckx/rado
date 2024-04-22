import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, table} from '../src/index.js'
import {connect} from './DbSuite.js'

const Node = table({
  Node: {
    id: column.integer().primaryKey<'node'>(),
    index: column.integer()
  }
})

test('logging', async () => {
  let logged = 0
  const db = await connect({
    logQuery(stmt, duration) {
      logged++
    }
  })
  await db(Node().create())
  await db(Node().insertOne({index: 1}))
  assert.is(logged, 2)
})

test.run()
