import {Builder, eq, table} from '@/index.ts'
import {integer, text} from '@/universal.ts'
import {suite} from '@benmerckx/suite'
import {query} from '../../src/query.ts'
import {emit} from '../TestUtils.ts'

const db = new Builder()

suite(import.meta, test => {
  const Node = table('Node', {
    id: integer().primaryKey(),
    field1: text()
  })

  test('select all available columns', () => {
    const all = query(db, {from: Node})
    test.equal(emit(all), 'select "Node"."id", "Node"."field1" from "Node"')
    const insert = {
      insert: Node,
      values: {field1: 'test'}
    }
    const result = query(db, {
      from: [
        Node,
        {leftJoin: Node, on: eq(Node.id, Node.id)},
        {rightJoin: Node, on: eq(Node.id, Node.id)}
      ]
    })
  })
})
