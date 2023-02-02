import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {Expr, select} from '../src/index'
import {connect} from './DbSuite'

test('basic', async () => {
  const db = await connect()
  const expr = Expr.create([1, 2, 3])
  assert.ok(await select(expr.includes(1)).sure().on(db))
  assert.not(await select(expr.includes(4)).sure().on(db))
})

test.run()
