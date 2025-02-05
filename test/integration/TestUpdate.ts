import {type Database, eq} from '@/index.ts'
import type {DefineTest} from '@alinea/suite'
import {concat} from '../../src/universal.ts'
import {Node} from './schema.ts'

export function testUpdate(db: Database, test: DefineTest) {
  test('update', async () => {
    await db.create(Node)
    try {
      await db.insert(Node).values({
        textField: 'hello',
        bool: true
      })

      await db
        .update(Node)
        .set({textField: concat(Node.textField, ' world')})
        .where(eq(Node.textField, 'hello'))

      const node = await db.select().from(Node).get()
      test.equal(node, {
        id: 1,
        textField: 'hello world',
        bool: true
      })
    } finally {
      await db.drop(Node)
    }
  })
}
