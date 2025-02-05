import {eq, sql, type Database} from '@/index.ts'
import {concat} from '@/universal.ts'
import type {DefineTest} from '@alinea/suite'
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
}
