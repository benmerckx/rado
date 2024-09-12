import {type Database, eq} from '@/index.ts'
import type {DefineTest} from '@alinea/suite'
import {Node} from './schema.ts'

export function testBatch(db: Database, test: DefineTest) {
  test('batch', async () => {
    await db.create(Node)
    try {
      await db.insert(Node).values([
        {textField: 'hello', bool: true},
        {textField: 'world', bool: false}
      ])
      await db.batch([
        db.update(Node).set({textField: 'world'}).where(eq(Node.id, 1)),
        db.update(Node).set({bool: true}).where(eq(Node.id, 2))
      ])
      const nodes = await db.select().from(Node)
      test.equal(nodes, [
        {id: 1, textField: 'world', bool: true},
        {id: 2, textField: 'world', bool: true}
      ])
    } finally {
      await db.drop(Node)
    }
  })
}
