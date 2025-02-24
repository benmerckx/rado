import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isNode} from '../TestRuntime.ts'

const mysqlConnection = 'mysql://root:mysql@localhost:3306/mysql'
await testDriver(suite(import.meta), async () => {
  if (!isNode) return
  const {mysql2: connect} = await import('@/driver.ts')
  const {default: mysql2} = await import('mysql2')
  const client = mysql2.createConnection(mysqlConnection)
  return connect(client)
})
