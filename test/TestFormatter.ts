import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {Expr, ExprData, Query, column} from '../src'
import {collection} from '../src/Collection'
import {Target} from '../src/Target'
import {SqliteFormatter} from '../src/sqlite'

const User = collection({
  name: 'users',
  columns: {
    id: column.string(),
    name: column.string()
  }
})

test('formatter', () => {
  const formatter = new SqliteFormatter()
  console.log(formatter)
  const [sql] = formatter.compile(
    Query.Select({
      from: Target.Collection(User.data()),
      selection: ExprData.Record({
        id: User.id.expr,
        random: Expr.value('random').expr
      }),
      where: User.id.is('1').expr,
      limit: 1
    })
  )
  console.log(sql)
  assert.ok(true)
})

test.run()
