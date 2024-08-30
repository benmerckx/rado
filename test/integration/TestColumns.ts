import {table, type Database} from '@/index.ts'
import * as column from '@/universal/columns.ts'
import type {DefineTest} from '@benmerckx/suite'

export function testColumns(db: Database, test: DefineTest) {
  test('id column', async () => {
    const TestTable = table('Test', {id: column.id()})
    await db.create(TestTable)
    await db.insert(TestTable).values({})
    const row = await db.select().from(TestTable).get()
    test.equal(row, {id: 1})
    await db.drop(TestTable)
  })

  test('text column', async () => {
    const TestTable = table('Test', {text: column.text()})
    await db.create(TestTable)
    await db.insert(TestTable).values({text: 'hello'})
    const row = await db.select().from(TestTable).get()
    test.equal(row, {text: 'hello'})
    await db.drop(TestTable)
  })

  test('boolean column', async () => {
    const TestTable = table('Test', {bool: column.boolean()})
    await db.create(TestTable)
    await db.insert(TestTable).values({bool: true})
    const row = await db.select().from(TestTable).get()
    test.equal(row, {bool: true})
    await db.drop(TestTable)
  })

  test('integer column', async () => {
    const TestTable = table('Test', {int: column.integer()})
    await db.create(TestTable)
    await db.insert(TestTable).values({int: 42})
    const row = await db.select().from(TestTable).get()
    test.equal(row, {int: 42})
    await db.drop(TestTable)
  })

  test('json column', async () => {
    const TestTable = table('Test', {json: column.json()})
    await db.create(TestTable)
    await db.insert(TestTable).values({json: {foo: 'bar'}})
    const row = await db.select().from(TestTable).get()
    test.equal(row, {json: {foo: 'bar'}})
    await db.drop(TestTable)
  })

  test('blob column', async () => {
    const encoder = new TextEncoder()
    const TestTable = table('Test', {blob: column.blob()})
    await db.create(TestTable)
    await db.insert(TestTable).values({blob: encoder.encode('hello')})
    const row = await db.select().from(TestTable).get()
    test.equal(row, {blob: encoder.encode('hello')})
    await db.drop(TestTable)
  })
}
