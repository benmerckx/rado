import {type Database, index, table, unique} from '@/index.ts'
import {id, integer, varchar} from '@/universal.ts'
import type {DefineTest} from '@alinea/suite'

// Initial table structure
const TableA = table(
  'Table',
  {
    id: id(),
    fieldA: varchar('fieldA', {length: 10}),
    removeMe: integer(),
    unchangedField: varchar('unchanged', {length: 20})
  },
  Table => {
    return {
      unique: unique().on(Table.fieldA),
      index: index().on(Table.removeMe),
      compositeIndex: index().on(Table.fieldA, Table.unchangedField)
    }
  }
)

// Modified table structure
const TableB = table(
  'Table',
  {
    id: id(),
    fieldB: varchar('fieldA', {length: 10}), // renamed from fieldA
    extraColumn: varchar(undefined, {length: 10}),
    unchangedField: varchar('unchanged', {length: 20}),
    newRequiredField: varchar('newRequired', {length: 15})
      .notNull()
      .default('default')
  },
  Table => {
    return {
      unique2: unique().on(Table.fieldB),
      index: index().on(Table.fieldB, Table.extraColumn),
      unchangedIndex: index().on(Table.unchangedField)
    }
  }
)

// Another version for testing multiple migrations
const TableC = table(
  'Table',
  {
    id: id(),
    fieldB: varchar('fieldA', {length: 20}), // increased length
    extraColumn: varchar(undefined, {length: 15}), // increased length
    unchangedField: varchar('unchanged', {length: 20}),
    newRequiredField: varchar('newRequired', {length: 15}) // made nullable
  },
  Table => {
    return {
      unique2: unique().on(Table.fieldB, Table.extraColumn), // modified unique constraint
      newIndex: index().on(Table.newRequiredField)
    }
  }
)

export function testMigration(db: Database, test: DefineTest) {
  test('basic migration', async () => {
    await db.create(TableA)
    try {
      await db.insert(TableA).values({
        fieldA: 'hello',
        removeMe: 0,
        unchangedField: 'test'
      })

      const node = await db.select().from(TableA).get()
      test.equal(node, {
        id: 1,
        fieldA: 'hello',
        removeMe: 0,
        unchangedField: 'test'
      })

      await db.migrate(TableB)
      const newNode = await db.select().from(TableB).get()
      test.equal(newNode, {
        id: 1,
        fieldB: 'hello',
        extraColumn: null,
        unchangedField: 'test',
        newRequiredField: 'default'
      })
    } finally {
      await db.drop(TableB)
    }
  })

  test('unique constraint migration', async () => {
    await db.create(TableA)
    try {
      // Test that unique constraint is enforced before migration
      await db.insert(TableA).values({
        fieldA: 'unique1',
        removeMe: 1,
        unchangedField: 'test1'
      })

      await db
        .insert(TableA)
        .values({
          fieldA: 'unique1',
          removeMe: 2,
          unchangedField: 'test2'
        })
        .then(
          () => test.ok(false),
          () => test.ok(true)
        )

      // Migrate and test that the new unique constraint is enforced
      await db.migrate(TableB)
      await db.insert(TableB).values({
        fieldB: 'unique2',
        extraColumn: 'extra',
        unchangedField: 'test3',
        newRequiredField: 'custom'
      })

      await db
        .insert(TableB)
        .values({
          fieldB: 'unique2',
          extraColumn: 'different',
          unchangedField: 'test4',
          newRequiredField: 'custom2'
        })
        .then(
          () => test.ok(false),
          () => test.ok(true)
        )
    } finally {
      await db.drop(TableB)
    }
  })

  test('multiple migrations', async () => {
    await db.create(TableA)
    try {
      // Insert initial data
      await db.insert(TableA).values({
        fieldA: 'initial',
        removeMe: 1,
        unchangedField: 'unchanged'
      })

      // First migration
      await db.migrate(TableB)
      const node = await db.select().from(TableB).get()
      test.equal(node?.fieldB, 'initial')
      test.equal(node?.newRequiredField, 'default')

      // Insert data with new schema
      await db.insert(TableB).values({
        fieldB: 'second',
        extraColumn: 'extra',
        unchangedField: 'test',
        newRequiredField: 'custom'
      })

      // Second migration
      await db.migrate(TableC)
      const nodes = await db.select().from(TableC)

      // Verify all data migrated correctly
      test.equal(nodes.length, 2)
      test.equal(nodes[0].fieldB, 'initial')
      test.equal(nodes[1].fieldB, 'second')
      test.equal(nodes[1].extraColumn, 'extra')

      // Test modified unique constraint
      await db
        .insert(TableC)
        .values({
          fieldB: 'second',
          extraColumn: 'extra',
          unchangedField: 'different',
          newRequiredField: null
        })
        .then(
          () => test.ok(false),
          () => test.ok(true)
        )
    } finally {
      await db.drop(TableC)
    }
  })

  test('index modifications', async () => {
    await db.create(TableA)
    try {
      // Insert some data to test indexes
      for (let i = 0; i < 5; i++) {
        await db.insert(TableA).values({
          fieldA: `value${i}`,
          removeMe: i,
          unchangedField: `test${i}`
        })
      }

      // Migrate to TableB (removes index on removeMe, adds index on fieldB+extraColumn)
      await db.migrate(TableB)

      // Insert more data with new schema
      for (let i = 5; i < 10; i++) {
        await db.insert(TableB).values({
          fieldB: `value${i}`,
          extraColumn: `extra${i}`,
          unchangedField: `test${i}`,
          newRequiredField: `required${i}`
        })
      }

      await db.migrate(TableC)
    } finally {
      await db.drop(TableC)
    }
  })
}
