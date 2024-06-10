import {table, type Database} from '../../src/index.ts'
import {SqliteDiff} from '../../src/sqlite/SqliteDiff.ts'
import {id, text} from '../../src/universal.ts'
import {suite} from '../Suite.ts'

const TableA = table('Table', {
  id: id(),
  fieldA: text(),
  removeMe: text()
})

const TableB = table('Table', {
  id: id(),
  fieldB: text('fieldA'),
  extraColumn: text()
})

export async function testSqliteDiff(
  meta: ImportMeta,
  createDb: () => Promise<Database>
) {
  const db = await createDb()
  suite(meta, ({test, isEqual}) => {
    test('diff', async () => {
      await db.create(TableA)
      const differ = new SqliteDiff(db)
      const diff = await differ.diffTable(TableB)
      console.log(diff)
      await db.drop(TableA)
    })
  })
}
