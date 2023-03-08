import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, table} from '../src/index.js'
import {match} from '../src/sqlite.js'
import {connect} from './DbSuite.js'

type Search = table<typeof Search>
const Search = table({
  Search: class {
    name = column.string()
    col2 = column.string().nullable()
  }
})

test('Search', async () => {
  if (
    process.env.TEST_DRIVER === 'sql.js' ||
    process.env.TEST_DRIVER === 'bun:sqlite'
  )
    return
  const query = await connect()
  await query`
    create virtual table if not exists Search using fts5(name, col2)
  `
  await query(
    Search().insertAll([
      {name: 'test'},
      {name: 'hello'},
      {name: 'world', col2: 'test ok'}
    ])
  )
  const results = await query(Search().where(match(Search, 'test')))
  assert.equal(
    results.map(res => res.name),
    ['test', 'world']
  )
})

test.run()
