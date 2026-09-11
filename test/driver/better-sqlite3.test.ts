import {suite} from '@alinea/suite'
import {temporaryTable} from '#/index.ts'
import {integer, text} from '#/sqlite.ts'
import {testDriver} from '../TestDriver.ts'
import {isNode} from '../TestRuntime.ts'

const test = suite(import.meta)

if (isNode) {
  const {'better-sqlite3': connect} = await import('#/driver.ts')
  const {default: Database} = await import('better-sqlite3')
  const db = connect(new Database(':memory:'))

  test('better-sqlite3: temporary table connection lifetime', () => {
    const Scratch = temporaryTable('Scratch', {
      id: integer().notNull(),
      value: text()
    })

    db.create(Scratch).run()
    try {
      db.insert(Scratch).values({id: 1, value: 'hello'}).run()
      test.equal(db.select().from(Scratch).get(), {id: 1, value: 'hello'})
    } finally {
      db.drop(Scratch).run()
    }
  })

  testDriver(db, test, 'better-sqlite3')
}
