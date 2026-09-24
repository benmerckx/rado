import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'

const test = suite(import.meta)
const {'sql.js': connect} = await import('#/driver.ts')
const {default: init} = await import('sql.js')
const {Database} = await init()

test('sql.js: cached statements are freed on close', () => {
  const client = new Database()
  const prepare = client.prepare.bind(client)
  let freeCount = 0
  client.prepare = (sql, params) => {
    const statement = prepare(sql, params)
    const free = statement.free.bind(statement)
    statement.free = () => {
      freeCount++
      return free()
    }
    return statement
  }
  const isolated = connect(client)
  isolated.driver.exec('create table items (id integer unique)')

  test.equal(
    isolated.driver.batch([
      {sql: 'insert into items values (?)', params: [1], isSelection: false},
      {sql: 'select id from items', params: [], isSelection: true}
    ]),
    [[], [[1]]]
  )
  test.equal(freeCount, 0)

  test.throws(() =>
    isolated.driver.batch([
      {sql: 'insert into items values (?)', params: [2], isSelection: false},
      {sql: 'insert into items values (?)', params: [1], isSelection: false}
    ])
  )
  // Rolling back could undo schema changes, so cached statements are freed
  test.equal(freeCount, 2)
  test.equal(
    isolated.driver.batch([
      {sql: 'select id from items', params: [], isSelection: true}
    ]),
    [[[1]]]
  )
  test.equal(freeCount, 2)
  isolated.close()
  test.equal(freeCount, 3)
})

const db = connect(new Database())
testDriver(db, test, 'sql.js')
