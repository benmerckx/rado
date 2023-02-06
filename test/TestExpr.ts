import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {Expr, column, select, table} from '../src/index'
import {connect} from './DbSuite'

test('Expr<Array<_>>.includes', async () => {
  const db = await connect()
  const expr = Expr.create([1, 2, 3])
  assert.ok(await select(expr.includes(1)).sure().on(db))
  assert.not(await select(expr.includes(4)).sure().on(db))
})

test('Expr<any>.is(_)', async () => {
  const db = await connect()
  const Table = table({
    name: 'test',
    columns: {
      id: column.integer().primaryKey<'test'>(),
      jsonColumn: column.object<any>()
    }
  })
  await Table.createTable().on(db)
  await Table.insertOne({jsonColumn: 'test'}).on(db)
  const res = await Table.where(Table.jsonColumn.is('test')).first().on(db)
  assert.ok(res)
})

test.run()
