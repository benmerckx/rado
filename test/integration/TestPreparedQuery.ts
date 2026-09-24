import type {DefineTest} from '@alinea/suite'
import {eq, sql, type Database} from '#/index.ts'
import {Node} from './schema.ts'

export function testPreparedQuery(db: Database, test: DefineTest) {
  test('prepared query methods and reuse', async () => {
    await db.create(Node)
    try {
      {
        await using select = db
          .select()
          .from(Node)
          .where(eq(Node.textField, sql.placeholder('text')))
          .prepare<{text: string}>('prepared-methods')
        await using insert = db
          .insert(Node)
          .values({textField: sql.placeholder('text'), bool: true})
          .prepare<{text: string}>('prepared-run')

        test.equal((await insert.run({text: 'hello'})).affectedRows, 1)
        test.equal((await insert.run({text: 'world'})).affectedRows, 1)

        test.equal(await select.get({text: 'hello'}), {
          id: 1,
          textField: 'hello',
          bool: true
        })
        test.equal(await select.get({text: 'missing'}), null)
        test.equal(await select.all({text: 'world'}), [
          {id: 2, textField: 'world', bool: true}
        ])
        test.equal(await select.all({text: 'hello'}), [
          {id: 1, textField: 'hello', bool: true}
        ])
      }
    } finally {
      await db.drop(Node)
    }
  })

  test('statements with the same sql are reused safely', async () => {
    await db.create(Node)
    try {
      await db.insert(Node).values({textField: 'a', bool: true})
      const typed = db
        .select({id: Node.id, textField: Node.textField})
        .from(Node)
      const raw = sql.unsafe<{id: number; textField: string}>(typed.toSQL().sql)
      const expected = [{id: 1, textField: 'a'}]
      test.equal(await typed, expected)
      const rows = await db.all(raw)
      test.equal(
        rows.map(row => ({...row})),
        expected
      )
      test.equal(await typed, expected)

      await using prepared = typed.prepare('reused')
      const star = sql<Record<string, unknown>>`select * from ${Node}`
      test.equal(Object.keys((await db.get(star))!), [
        'id',
        'textField',
        'bool'
      ])
      await db.run(
        sql`alter table ${Node} add column ${sql.identifier('extra')} integer`
      )
      test.equal(Object.keys((await db.get(star))!), [
        'id',
        'textField',
        'bool',
        'extra'
      ])
      test.equal(await prepared.all(), expected)
    } finally {
      await db.drop(Node)
    }
  })

  test('prepared queries', async () => {
    try {
      await db.create(Node)
      await db.insert(Node).values({
        textField: 'hello',
        bool: true
      })
      const query = db
        .select()
        .from(Node)
        .where(eq(Node.textField, sql.placeholder('text')))
        .prepare<{text: string}>('prepared')
      const rows = await query.execute({text: 'hello'})
      test.equal(rows, [{id: 1, textField: 'hello', bool: true}])
    } finally {
      await db.drop(Node)
    }
  })

  test('prepared selection and mutation execute results', async () => {
    try {
      await db.create(Node)
      const insert = db
        .insert(Node)
        .values({
          textField: sql.placeholder('text'),
          bool: true
        })
        .prepare<{text: string}>('prepared-insert')
      const insertResult = await insert.execute({text: 'hello'})
      test.equal(insertResult.affectedRows, 1)

      const select = db
        .select(Node.textField)
        .from(Node)
        .where(eq(Node.id, 1))
        .prepare('prepared-select')
      const selectResult = await select.execute()
      test.equal(selectResult, ['hello'])
    } finally {
      await db.drop(Node)
    }
  })
}
