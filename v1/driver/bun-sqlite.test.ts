import {Database} from 'bun:sqlite'
import {expect, test} from 'bun:test'
import {table} from '../core/Table.ts'
import {integer} from '../sqlite.ts'
import {connect} from './bun-sqlite.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

test('create table', () => {
  const db = connect(new Database(':memory:'))
  db.create(Node).run()
  const cr = db.update(Node)
  db.transaction(tx => {
    tx.insert(Node)
    return 123
  })
  db.insert(Node).values({}).run()
  const nodes = db.select({id: Node.id}).from(Node).all()
  expect(nodes).toEqual([{id: 1}])
})
