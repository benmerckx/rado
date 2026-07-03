import type {DefineTest} from '@alinea/suite'
import {type Database, sql} from '#/index.ts'

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
}
