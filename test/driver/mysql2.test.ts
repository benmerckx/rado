import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {testServers} from '../TestRuntime.ts'
import {failure} from '../TestUtils.ts'

const test = suite(import.meta)

if (testServers) {
  const mysqlConnection = 'mysql://root:mysql@localhost:3306/mysql'
  const {mysql2: connect} = await import('#/driver.ts')
  const {migrate} = await import('#/migrate.ts')
  const {default: mysql2} = await import('mysql2')

  test('mysql2: migrate needs multipleStatements', async () => {
    const db = connect(mysql2.createPool(mysqlConnection).promise())
    test.equal(
      await failure(() => migrate(db, {'0001.sql': 'select 1'})),
      'Migrations need multipleStatements: true'
    )
    await db.close()
  })

  const client = mysql2.createConnection({
    uri: mysqlConnection,
    multipleStatements: true
  })
  const db = connect(client)
  testDriver(db, test, 'mysql2')
}
