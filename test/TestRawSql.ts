import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {sql} from '../src'
import {connect} from './DbSuite'

const db = await connect()
const valueWithQuotes = 'test"t\'est'

test('Get row', async () => {
  assert.equal(await sql.get`select ${valueWithQuotes} as res`.on(db), {
    res: valueWithQuotes
  })
})

test('Get rows', async () => {
  assert.equal(
    await sql.all`
      with recursive
        cnt(x) as (values(${1}) union all select x+${1} from cnt where x<3)
      select x from cnt;
    `.on(db),
    [{x: 1}, {x: 2}, {x: 3}]
  )
})

test('Execute', async () => {
  await db(
    sql`create table test (id integer primary key, name text)`,
    sql`insert into test (name) values (${valueWithQuotes})`
  )
  assert.equal(await sql.all`select * from test`.on(db), [
    {id: 1, name: valueWithQuotes}
  ])
})

test.run()
