import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, create, table} from '../src/index.js'
import {connect} from './DbSuite.js'

test('Iterate', async () => {
  const db = await connect()
  const Node = table({
    Node: {
      id: column.integer().primaryKey<'node'>(),
      index: column.number()
    }
  })
  await create(Node).on(db)
  const amount = 10
  const objects = Array.from({length: amount}).map((_, index) => ({index}))
  await Node().insert(objects).on(db)
  for await (const node of db.iterate(Node())) {
    assert.is(node.index, objects.shift()?.index)
  }
})

test.run()
