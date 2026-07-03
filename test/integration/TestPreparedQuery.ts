import type {DefineTest} from '@alinea/suite'
import {eq, sql, type Database} from '#/index.ts'
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

  test('prepared selection and mutation execute results', async () => {
    try {
      await db.create(Node)
      const insert = db
        .insert(Node)
        .values({
          textField: sql.placeholder('text'),
          bool: true
        })
        .prepare<{text: string}>('prepared-insert')
      const insertResult = await insert.execute({text: 'hello'})
      test.equal(insertResult, [])

      const select = db
        .select(Node.textField)
        .from(Node)
        .where(eq(Node.id, 1))
        .prepare('prepared-select')
      const selectResult = await select.execute()
      test.equal(selectResult, ['hello'])
    } finally {
      await db.drop(Node)
    }
  })
}
