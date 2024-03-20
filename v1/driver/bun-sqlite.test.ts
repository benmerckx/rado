import {Database} from 'bun:sqlite'
import {expect, test} from 'bun:test'
import {table} from '../core/Table.ts'
import {create} from '../core/query/Create.ts'
import {insert} from '../core/query/Insert.ts'
import {integer} from '../sqlite.ts'
import {connect} from './bun-sqlite.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

test('create table', () => {
  const db = connect(new Database(':memory:'))
  create(Node).run(db)
  insert(Node).values({}).run(db)
  const nodes = db.select({id: Node.id}).from(Node).all()
  expect(nodes).toEqual([{id: 1}])
})
