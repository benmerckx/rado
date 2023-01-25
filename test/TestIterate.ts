import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, create, table} from '../src'
import {connect} from './DbSuite'

test('Iterate', async () => {
  const db = await connect()
  const Node = table({
    name: 'node',
    columns: {
      id: column.integer().primaryKey<'node'>(),
      index: column.number()
    }
  })
  await create(Node).run(db)
  const amount = 10
  const objects = Array.from({length: amount}).map((_, index) => ({index}))
  await Node.insertAll(objects).run(db)
  for await (const node of db.iterate(Node)) {
    assert.is(node.index, objects.shift()?.index)
  }
})

test.run()
