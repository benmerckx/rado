import {expect, test} from 'bun:test'
import init from 'sql.js'
import {table} from '../core/Table.ts'
import {integer} from '../sqlite.ts'
import {connect} from './sql.js.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

test('create table', async () => {
  const {Database} = await init()
  const db = connect(new Database())
  db.create(Node).run()
  db.insert(Node).values({}).run()
  const nodes = db.select({id: Node.id}).from(Node).all()
  expect(nodes).toEqual([{id: 1}])
})
