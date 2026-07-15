import type {DefineTest} from '@alinea/suite'
import {sql, table, type Database} from '#/index.ts'
import {pgEnum} from '#/postgres.ts'

export function testEnums(db: Database, test: DefineTest) {
  test('postgres enum create + insert', async () => {
    const mood = pgEnum('mood', ['sad', 'ok', 'happy'])
    const MoodTable = table('Mood', {state: mood().notNull()})
    try {
      await db.create(MoodTable)
      await db.insert(MoodTable).values({state: 'happy'})
      const row = await db.select().from(MoodTable).get()
      test.equal(row, {state: 'happy'})
    } finally {
      await db.drop(MoodTable)
      await db.run(sql`drop type if exists ${sql.identifier('mood')}`)
    }
  })
}
