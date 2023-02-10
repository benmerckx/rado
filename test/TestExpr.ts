import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {Expr, column, select, table} from '../src/index'
import {connect} from './DbSuite'

test('Expr<Array<_>>.includes', async () => {
  const db = await connect()
  const expr = Expr.create([1, 2, 3])
  assert.ok(await select(expr.includes(1)).first().on(db))
  assert.not(await select(expr.includes(4)).first().on(db))
})

test('Expr<any>.is(_)', async () => {
  const db = await connect()
  const Table = table({
    test: {
      id: column.integer().primaryKey<'test'>(),
      jsonColumn: column.json<any>()
    }
  })
  await Table().create().on(db)
  await Table().insertOne({jsonColumn: 'test'}).on(db)
  const res = await Table({jsonColumn: 'test'}).maybeFirst().on(db)
  assert.ok(res)
})

test('boolean selects', async () => {
  const db = await connect()
  const res = await db(select(Expr.create(true)).first())
  assert.is(res, true)
  // Todo: if we keep a better context around during formatting we can cast
  // this to a bool in the select itself
  // const res2 = await db(select(Expr.create(true).is(true)).sure())
  // assert.is(res2, true)
})

test('JSON object columns', async () => {
  const Table = table({
    test: {
      id: column.integer().primaryKey<'test'>(),
      jsonColumn: column.object<{foo: {bar: string}}>()
    }
  })
  assert.ok(Table.jsonColumn.foo.bar.is('test'))

  assert.ok(
    Expr.value({a: {b: 1}})
      .dynamic()
      .a.b.is(1)
  )
})

test.run()
