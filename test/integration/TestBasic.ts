import type {DefineTest} from '@alinea/suite'
import {type Database, asc, eq, sql} from '#/index.ts'
import {concat} from '#/universal.ts'
import {Node} from './schema.ts'

export function testBasic(db: Database, test: DefineTest) {
  test('basic', async () => {
    try {
      await db.create(Node)
      const nothing = await db.select().from(Node).get()
      test.equal(nothing, null)
      await db.insert(Node).values({
        textField: 'hello',
        bool: true
      })
      const nodes = await db.select().from(Node)
      test.equal(nodes, [{id: 1, textField: 'hello', bool: true}])
      await db.update(Node).set({textField: 'world'}).where(eq(Node.id, 1))
      const textField = db.select(Node.textField).from(Node)
      test.equal(await textField.get(), 'world')
      await db.update(Node).set({
        textField: db.select(sql.value('test'))
      })
      test.equal(await textField.get(), 'test')
      const abc = await db.select(concat('a', 'b', 'c')).get()
      test.equal(abc, 'abc')
    } finally {
      await db.drop(Node)
    }
  })

  test('null boolean', async () => {
    try {
      await db.create(Node)
      await db.insert(Node).values({textField: 'a', bool: null})
      test.equal(await db.select(Node.bool).from(Node), [null])
    } finally {
      await db.drop(Node)
    }
  })

  test('offset without limit', async () => {
    try {
      await db.create(Node)
      await db.insert(Node).values([{textField: 'a'}, {textField: 'b'}])
      const rest = db.select(Node.textField).from(Node).orderBy(asc(Node.id))
      test.equal(await rest.offset(1), ['b'])
      test.equal(await rest.limit(-1).offset(1), ['b'])
    } finally {
      await db.drop(Node)
    }
  })
}
