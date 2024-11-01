import {type Database, index, table, unique} from '@/index.ts'
import {id, integer, varchar} from '@/universal.ts'
import type {DefineTest} from '@alinea/suite'

const TableA = table(
  'Table',
  {
    id: id(),
    fieldA: varchar('fieldA', {length: 10}),
    removeMe: integer()
  },
  Table => {
    return {
      unique: unique().on(Table.fieldA),
      index: index().on(Table.removeMe)
    }
  }
)

const TableB = table(
  'Table',
  {
    id: id(),
    fieldB: varchar('fieldA', {length: 10}),
    extraColumn: varchar(undefined, {length: 10})
  },
  Table => {
    return {
      unique2: unique().on(Table.fieldB),
      index: index().on(Table.fieldB, Table.extraColumn)
    }
  }
)

export function testMigration(db: Database, test: DefineTest) {
  test('migration', async () => {
    await db.drop(TableA).catch(() => {})
    await db.create(TableA)
    try {
      await db.insert(TableA).values({fieldA: 'hello', removeMe: 0})

      const node = await db.select().from(TableA).get()
      test.equal(node, {id: 1, fieldA: 'hello', removeMe: 0})

      await db.migrate(TableB)
      const newNode = await db.select().from(TableB).get()
      test.equal(newNode, {id: 1, fieldB: 'hello', extraColumn: null})
    } finally {
      await db.drop(TableA)
    }
  })
}
