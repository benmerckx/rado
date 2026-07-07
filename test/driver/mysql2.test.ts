import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {testMysql} from '../TestRuntime.ts'

const test = suite(import.meta)

if (testMysql) {
  const mysqlConnection = 'mysql://root:mysql@localhost:3306/mysql'
  const {mysql2: connect} = await import('#/driver.ts')
  const {default: mysql2} = await import('mysql2')
  const client = mysql2.createConnection(mysqlConnection)
  const db = connect(client)
  testDriver(db, test, 'mysql2')
}
