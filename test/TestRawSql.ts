import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {connect} from './DbSuite'

const query = await connect()
const valueWithQuotes = 'test"t\'est'

test('Get row', async () => {
  assert.equal(await query.get`select ${valueWithQuotes} as res`, {
    res: valueWithQuotes
  })
})

test('Get rows', async () => {
  assert.equal(
    await query.all`
      with recursive
        cnt(x) as (values(${1}) union all select x+${1} from cnt where x<3)
      select x from cnt;
    `,
    [{x: 1}, {x: 2}, {x: 3}]
  )
})

test('Execute', async () => {
  await query(
    query.sql`create table test (id integer primary key, name text)`,
    query.sql`insert into test (name) values (${valueWithQuotes})`
  )
  assert.equal(await query.all`select * from test`, [
    {id: 1, name: valueWithQuotes}
  ])
})

test.run()
