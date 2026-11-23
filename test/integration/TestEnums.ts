import type {DefineTest} from '@alinea/suite'
import {sql, table, type Database} from '#/index.ts'
import {pgEnum, pgSchema} from '#/postgres.ts'
import {create, drop} from '#/push.ts'

export function testEnums(db: Database, test: DefineTest) {
  test('create a schema before its enums', async () => {
    const zz = pgSchema('enum_zz')
    // Namespaces list their keys alphabetically
    const schema = {
      Mood: zz.table('enum_mood', {state: zz.enum('enum_state', ['a'])()}),
      state: zz.enum('enum_state', ['a']),
      zz
    }
    try {
      await create(db, schema)
      await db.insert(schema.Mood).values({state: 'a'})
      test.equal(await db.select(schema.Mood.state).from(schema.Mood), ['a'])
    } finally {
      // A schema object's pgSchema is left to drop by hand
      await drop(db, schema)
      await db.drop(zz)
    }
  })

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
