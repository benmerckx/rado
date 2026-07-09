import type {DefineTest} from '@alinea/suite'
import {type Database, eq} from '#/index.ts'
import {Node} from './schema.ts'

export function testMutationResult(db: Database, test: DefineTest) {
  test('mutation results', async () => {
    await db.create(Node)
    try {
      const insert = await db.insert(Node).values({
        textField: 'hello',
        bool: true
      })

      test.equal(insert.affectedRows, 1)
      if ('insertId' in insert && insert.insertId !== undefined) {
        test.equal(Number(insert.insertId), 1)
      }
      if (db.dialect.runtime === 'mysql') {
        test.equal(insert.changedRows, 0)
      } else {
        test.equal('changedRows' in insert, false)
      }

      const update = await db
        .update(Node)
        .set({textField: 'world'})
        .where(eq(Node.id, 1))

      test.equal(update.affectedRows, 1)
      if (db.dialect.runtime === 'mysql') {
        test.equal(update.changedRows, 1)
      } else {
        test.equal('changedRows' in update, false)
      }

      const remove = await db.delete(Node).where(eq(Node.id, 1))

      test.equal(remove.affectedRows, 1)
      if (db.dialect.runtime === 'mysql') {
        test.equal(remove.changedRows, 0)
      } else {
        test.equal('changedRows' in remove, false)
      }
    } finally {
      await db.drop(Node)
    }
  })
}
