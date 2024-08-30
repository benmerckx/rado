import {eq, sql, type Database} from '@/index.ts'
import type {DefineTest} from '@benmerckx/suite'
import {Node} from './schema.ts'

export function testPreparedQuery(db: Database, test: DefineTest) {
  test('prepared queries', async () => {
    try {
      await db.create(Node)
      await db.insert(Node).values({
        textField: 'hello',
        bool: true
      })
      const query = db
        .select()
        .from(Node)
        .where(eq(Node.textField, sql.placeholder('text')))
        .prepare<{text: string}>('prepared')
      const rows = await query.execute({text: 'hello'})
      test.equal(rows, [{id: 1, textField: 'hello', bool: true}])
    } finally {
      await db.drop(Node)
    }
  })
}
