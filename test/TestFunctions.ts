import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {Expr, Functions, column, select, table} from '../src/index'
import {cast, count, strftime} from '../src/sqlite'
import {connect} from './DbSuite'

test('dynamic', async () => {
  const query = await connect()
  const {json_patch} = Functions
  const patched = await query(select(json_patch({a: 1}, {a: 0, b: 2})).first())
  assert.equal(patched, {a: 0, b: 2})
})

test('Functions', async () => {
  const db = await connect()
  const User = table({
    User: class {
      id = column.integer().primaryKey()
      birthdate = column.string()
    }
  })
  await User().create().on(db)
  const now = '1920-01-01'
  const int = (e: Expr<any>) => cast(e, 'integer')
  const age: Expr<number> = int(strftime('%Y', now))
    .substract(int(strftime('%Y', User.birthdate)))
    .substract(
      int(strftime('%m-%d', now).isLess(strftime('%m-%d', User.birthdate)))
    )
  const me = await User().insertOne({birthdate: '1900-01-01'}).on(db)
  assert.is((await User({id: me.id}).first().select({age}).on(db)).age, 20)
  assert.is(await User({id: me.id}).select(count()).maybeFirst().on(db), 1)
})

test.run()
