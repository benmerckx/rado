import type {IsMysql, IsPostgres} from '@/core/MetaData.ts'
import {type Database, table} from '@/index.ts'
import {varchar} from '@/universal.ts'
import type {DefineTest} from '@alinea/suite'

export const WithUnique = table('WithUnique', {
  value: varchar(undefined, {length: 1}).primaryKey()
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
}
