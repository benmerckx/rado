import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {
  BinOpType,
  Expr,
  ExprData,
  ParamData,
  Query,
  Target,
  column,
  table
} from '../src/index.js'
import {SqliteFormatter} from '../src/sqlite.js'

test('x in y', async () => {
  const formatter = new SqliteFormatter()
  const ctx = formatter.createContext({skipNewlines: true})
  const stmt = formatter.formatExpr(
    ctx,
    new ExprData.BinOp(
      BinOpType.In,
      new ExprData.Param(new ParamData.Value(1)),
      new ExprData.Param(new ParamData.Value([1, 2, 3]))
    )
  )
  assert.is(stmt.sql, `(? IN (?, ?, ?))`)
})

const Example = table({
  example: {
    id: column.number(),
    array: column.array<{num: number}[]>(),
    obj: column.object<{sub: {num: number}}>()
  }
})

test('x in y.map(_)', () => {
  const formatter = new SqliteFormatter()
  const ctx = formatter.createContext({skipNewlines: true})
  const field = Example.array.map(row => row.num)[Expr.Data] as ExprData.Map
  ;(field.target as Target.Expr).alias = 'map'
  const stmt = formatter.formatExpr(
    ctx,
    new ExprData.BinOp(
      BinOpType.In,
      new ExprData.Param(new ParamData.Value(1)),
      field
    )
  )
  assert.is(
    stmt.sql,
    "(? IN (SELECT `map`.value->>'$.num' AS result FROM json_each(json(`example`.`array`)) AS `map`))"
  )
})

test('{x}.x', () => {
  const formatter = new SqliteFormatter()
  const ctx = formatter.createContext({skipNewlines: true})
  const stmt = formatter.formatExpr(ctx, Example.obj.sub.num[Expr.Data])
  assert.is(stmt.sql, "`example`.`obj`->>'$.sub.num'")
})

test('inline value', () => {
  const formatter = new SqliteFormatter()
  const ctx = formatter.createContext({skipNewlines: true})
  const stmt = formatter.formatExpr(ctx, Expr.value('test', true)[Expr.Data])
  assert.is(stmt.sql, "'test'")
})

test('delete', async () => {
  const formatter = new SqliteFormatter()
  const ctx = formatter.createContext({skipNewlines: true, forceInline: true})
  const stmt = formatter.format(
    ctx,
    Example().delete().where(true).orderBy(Example.id.desc()).take(1).skip(15)[
      Query.Data
    ]
  )
  assert.is(
    stmt.sql,
    'DELETE FROM `example` WHERE 1 ORDER BY `example`.`id` DESC LIMIT 1 OFFSET 15'
  )
})

test.run()
