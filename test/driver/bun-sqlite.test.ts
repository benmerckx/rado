import {suite} from '@alinea/suite'
import {temporaryTable} from '#/index.ts'
import {integer, text} from '#/sqlite.ts'
import {testDriver} from '../TestDriver.ts'
import {isBun} from '../TestRuntime.ts'

const test = suite(import.meta)

if (isBun) {
  const {'bun:sqlite': connect} = await import('#/driver.ts')
  const {Database} = await import('bun:sqlite')
  const {existsSync, mkdtempSync, rmSync} = await import('node:fs')
  const {tmpdir} = await import('node:os')
  const {join} = await import('node:path')

  test('bun:sqlite: batch statements do not keep files open', () => {
    const directory = mkdtempSync(join(tmpdir(), 'rado-bun-sqlite-'))
    const path = join(directory, 'database.sqlite')
    try {
      const fileDb = connect(new Database(path))
      fileDb.driver.batch([
        {
          sql: 'create table items (id integer unique)',
          params: [],
          isSelection: false
        },
        {sql: 'insert into items values (?)', params: [1], isSelection: false},
        {sql: 'select id from items', params: [], isSelection: true}
      ])
      test.throws(() =>
        fileDb.driver.batch([
          {
            sql: 'insert into items values (?)',
            params: [2],
            isSelection: false
          },
          {sql: 'insert into items values (?)', params: [1], isSelection: false}
        ])
      )
      fileDb.close()

      const reopened = new Database(path)
      reopened.close()
      rmSync(directory, {recursive: true})
      test.equal(existsSync(directory), false)
    } finally {
      if (existsSync(directory)) rmSync(directory, {recursive: true})
    }
  })

  const db = connect(new Database(':memory:'))

  test('bun:sqlite: temporary table connection lifetime', () => {
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

  testDriver(db, test, 'bun:sqlite')
}
