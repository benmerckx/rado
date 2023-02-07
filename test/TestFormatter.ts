import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {
  BinOpType,
  ExprData,
  ParamData,
  Target,
  column,
  table
} from '../src/index'
import {SqliteFormatter} from '../src/sqlite'

test('x in y', async () => {
  const formatter = new SqliteFormatter()
  const ctx = formatter.createContext({skipNewlines: true})
  const stmt = formatter.formatExpr(
    ctx,
    ExprData.BinOp(
      BinOpType.In,
      ExprData.Param(ParamData.Value(1)),
      ExprData.Param(ParamData.Value([1, 2, 3]))
    )
  )
  assert.is(stmt.sql, `(? IN (?, ?, ?))`)
})

const Example = table('example')({
  array: column.array<{num: number}>()
})

test('x in y.map(_)', async () => {
  const formatter = new SqliteFormatter()
  const ctx = formatter.createContext({skipNewlines: true})
  const field = Example.array.map(row => row.num).expr as ExprData.Map
  ;(field.target as Target.Expr).alias = 'map'
  const stmt = formatter.formatExpr(
    ctx,
    ExprData.BinOp(BinOpType.In, ExprData.Param(ParamData.Value(1)), field)
  )
  assert.is(
    stmt.sql,
    "(? IN (SELECT `map`.value->>'$.num' AS result FROM json_each(json(`example`.`array`)) AS `map`))"
  )
})

test.run()
