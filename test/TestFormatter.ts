import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {BinOp, ExprData, ParamData} from '../src/index'
import {SqliteFormatter} from '../src/sqlite'

test('x in y', async () => {
  const formatter = new SqliteFormatter()
  const ctx = formatter.createContext({skipNewlines: true})
  const stmt = formatter.formatExpr(
    ctx,
    ExprData.BinOp(
      BinOp.In,
      ExprData.Param(ParamData.Value(1)),
      ExprData.Param(ParamData.Value([1, 2, 3]))
    )
  )
  assert.is(stmt.sql, `(? in (?, ?, ?))`)
})

test.run()
