import {type Database, table} from '@/index.ts'
import {id, text} from '@/universal.ts'
import type {DefineTest} from '@alinea/suite'

export function testMigration(db: Database, test: DefineTest) {
  test('migration', async () => {
    const TableA = table('Table', {
      id: id(),
      fieldA: text(),
      removeMe: text()
    })

    await db.create(TableA)
    try {
      await db.insert(TableA).values({fieldA: 'hello', removeMe: 'world'})

      const node = await db.select().from(TableA).get()
      test.equal(node, {id: 1, fieldA: 'hello', removeMe: 'world'})

      const TableB = table('Table', {
        id: id(),
        fieldB: text('fieldA'),
        extraColumn: text()
      })

      await db.migrate(TableB)
      const newNode = await db.select().from(TableB).get()
      test.equal(newNode, {id: 1, fieldB: 'hello', extraColumn: null})
    } finally {
      await db.drop(TableA)
    }
  })
}
