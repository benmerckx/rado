import type {DefineTest} from '@alinea/suite'
import {type Database, sql} from '#/index.ts'
import {Node} from './schema.ts'

export function testDirectQuery(db: Database, test: DefineTest) {
  test('database get/all', async () => {
    const one = await db.get(sql<{value: string}>`select ${'one'} as value`)
    test.equal(one?.value, 'one')

    const rows = await db.all(sql<{value: string}>`select ${'one'} as value`)
    test.equal(
      rows.map(row => row.value),
      ['one']
    )
  })

  test('database execute preserves raw and query results', async () => {
    const [rawRows] = await db.execute(
      sql<{value: string}>`select ${'raw'} as value`
    )
    test.equal(
      rawRows.map(row => row.value),
      ['raw']
    )

    await db.create(Node)
    try {
      const insertResult = await db.execute(
        db.insert(Node).values({textField: 'hello', bool: true})
      )
      test.equal(insertResult.affectedRows, 1)

      const rows = await db.execute(db.select(Node.textField).from(Node))
      test.equal(rows, ['hello'])
    } finally {
      await db.drop(Node)
    }
  })
}
