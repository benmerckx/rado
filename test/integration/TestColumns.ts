import {table, type Database} from '@/index.ts'
import * as column from '@/universal/columns.ts'
import type {DefineTest} from '@benmerckx/suite'

export function testColumns(db: Database, test: DefineTest) {
  test('id column', async () => {
    const TestTable = table('Test', {id: column.id()})
    await db.create(TestTable)
    try {
      await db.insert(TestTable).values({})
      const row = await db.select().from(TestTable).get()
      test.equal(row, {id: 1})
    } finally {
      await db.drop(TestTable)
    }
  })

  test('varchar column', async () => {
    const TestTable = table('Test', {
      varchar: column.varchar('varchar', {length: 5})
    })
    await db.create(TestTable)
    try {
      await db.insert(TestTable).values({varchar: 'hello'})
      const row = await db.select().from(TestTable).get()
      test.equal(row, {varchar: 'hello'})
    } finally {
      await db.drop(TestTable)
    }
  })

  test('text column', async () => {
    const TestTable = table('Test', {text: column.text()})
    await db.create(TestTable)
    try {
      await db.insert(TestTable).values({text: 'hello'})
      const row = await db.select().from(TestTable).get()
      test.equal(row, {text: 'hello'})
    } finally {
      await db.drop(TestTable)
    }
  })

  test('boolean column', async () => {
    const TestTable = table('Test', {bool: column.boolean()})
    await db.create(TestTable)
    try {
      await db.insert(TestTable).values({bool: true})
      const row = await db.select().from(TestTable).get()
      test.equal(row, {bool: true})
    } finally {
      await db.drop(TestTable)
    }
  })

  test('integer column', async () => {
    const TestTable = table('Test', {int: column.integer()})
    await db.create(TestTable)
    try {
      await db.insert(TestTable).values({int: 42})
      const row = await db.select().from(TestTable).get()
      test.equal(row, {int: 42})
    } finally {
      await db.drop(TestTable)
    }
  })

  test('number column', async () => {
    const TestTable = table('Test', {number: column.number()})
    await db.create(TestTable)
    try {
      const values = [
        {number: 4.2},
        {number: Number.MAX_SAFE_INTEGER},
        {number: Number.MIN_SAFE_INTEGER}
      ]
      await db.insert(TestTable).values(values)
      const rows = await db.select().from(TestTable)
      test.equal(rows, values)
    } finally {
      await db.drop(TestTable)
    }
  })

  test('json column', async () => {
    const TestTable = table('Test', {json: column.json()})
    await db.create(TestTable)
    try {
      await db.insert(TestTable).values({json: {foo: 'bar'}})
      const row = await db.select().from(TestTable).get()
      test.equal(row, {json: {foo: 'bar'}})
    } finally {
      await db.drop(TestTable)
    }
  })

  test('blob column', async () => {
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const TestTable = table('Test', {blob: column.blob().notNull()})
    await db.create(TestTable)
    try {
      await db.insert(TestTable).values({blob: encoder.encode('hello')})
      const row = await db.select().from(TestTable).get()
      test.equal(decoder.decode(row!.blob), 'hello')
    } finally {
      await db.drop(TestTable)
    }
  })
}
