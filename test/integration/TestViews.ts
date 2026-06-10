import type {DefineTest} from '@alinea/suite'
import {type Database, eq, sql, view} from '@/index.ts'
import {integer, text} from '@/universal.ts'
import {Node} from './schema.ts'

export function testViews(db: Database, test: DefineTest) {
  test('create and query view from select', async () => {
    const activeNodes = view('ActiveNodes').as(
      db
        .select({
          id: Node.id,
          textField: Node.textField
        })
        .from(Node)
        .where(eq(Node.bool, true))
    )

    try {
      await db.create(Node, activeNodes)
      await db.insert(Node).values([
        {textField: 'one', bool: true},
        {textField: 'two', bool: false}
      ])

      const result = await db
        .select({
          id: activeNodes.id,
          textField: activeNodes.textField
        })
        .from(activeNodes)

      test.equal(result, [{id: 1, textField: 'one'}])
    } finally {
      await db.drop(activeNodes, Node)
    }
  })

  test('create and query defined view', async () => {
    const allNodes = view('AllNodes', {
      id: integer(),
      textField: text()
    }).as(sql`select ${Node.id}, ${Node.textField} from ${Node}`)

    try {
      await db.create(Node, allNodes)
      await db.insert(Node).values([
        {textField: 'one', bool: true},
        {textField: 'two', bool: false}
      ])

      const result = await db
        .select({
          id: allNodes.id,
          textField: allNodes.textField
        })
        .from(allNodes)

      test.equal(result, [
        {id: 1, textField: 'one'},
        {id: 2, textField: 'two'}
      ])
    } finally {
      await db.drop(allNodes, Node)
    }
  })
}
