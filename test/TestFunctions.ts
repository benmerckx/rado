import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {Expr, column, table} from '../src'
import {SqliteFunctions} from '../src/sqlite/SqliteFunctions'
import {connect} from './DbSuite'

const {cast, strftime} = SqliteFunctions

test('Functions', async () => {
  const query = await connect()
  const User = table({
    name: 'User',
    columns: {
      id: column.integer().primaryKey(),
      birthdate: column.string()
    }
  })
  await query(User.createTable())
  const now = '1920-01-01'
  const int = (e: Expr<any>) => cast(e, 'integer')
  const age: Expr<number> = int(strftime('%Y', now))
    .substract(int(strftime('%Y', User.birthdate)))
    .substract(
      int(strftime('%m-%d', now).less(strftime('%m-%d', User.birthdate)))
    )
  const me = await query(User.insertOne({birthdate: '1900-01-01'}))
  assert.is(
    (await query(User.first().select({age}).where(User.id.is(me.id))))!.age,
    20
  )
})

test.run()
