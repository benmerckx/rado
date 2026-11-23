import type {DefineTest} from '@alinea/suite'
import type {IsMysql, IsPostgres} from '#/core/MetaData.ts'
import {type Database, table} from '#/index.ts'
import {integer, jsonb, varchar} from '#/universal.ts'

export const WithUnique = table('WithUnique', {
  value: varchar(undefined, {length: 1}).primaryKey()
})

const Settings = table('Settings', {
  id: integer().primaryKey(),
  settings: jsonb<{theme: string}>('settings_json')
})

export function testConflicts(db: Database, test: DefineTest) {
  test('conflicts', async () => {
    await db.create(WithUnique)
    try {
      await db.insert(WithUnique).values({value: 'x'})
      const query =
        db.dialect.runtime === 'mysql'
          ? (<Database<IsMysql>>db)
              .insert(WithUnique)
              .values({value: 'x'})
              .onDuplicateKeyUpdate({
                set: {value: 'y'}
              })
          : (<Database<IsPostgres>>db)
              .insert(WithUnique)
              .values({value: 'x'})
              .onConflictDoUpdate({
                target: WithUnique.value,
                set: {value: 'y'}
              })
      await query
      const row = await db.select().from(WithUnique).get()
      test.equal(row, {value: 'y'})
    } finally {
      await db.drop(WithUnique)
    }
  })

  test('conflict updates map through the column', async () => {
    await db.create(Settings)
    try {
      const values = {id: 1, settings: {theme: 'light'}}
      const set = {settings: {theme: 'dark'}}
      for (let i = 0; i < 2; i++)
        await (db.dialect.runtime === 'mysql'
          ? (<Database<IsMysql>>db)
              .insert(Settings)
              .values(values)
              .onDuplicateKeyUpdate({set})
          : (<Database<IsPostgres>>db)
              .insert(Settings)
              .values(values)
              .onConflictDoUpdate({target: Settings.id, set}))
      test.equal(await db.select(Settings.settings).from(Settings), [
        {theme: 'dark'}
      ])
    } finally {
      await db.drop(Settings)
    }
  })
}
