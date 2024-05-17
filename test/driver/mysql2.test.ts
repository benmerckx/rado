import {connect} from '../../src/driver/mysql2.ts'
import {isDeno} from '../Suite.ts'
import {testDriver} from '../TestDriver.ts'

if (!isDeno)
  await testDriver(import.meta, async () => {
    const {default: mysql2} = await import('mysql2')
    const client = mysql2.createConnection(
      'mysql://root:mysql@0.0.0.0:3306/mysql'
    )
    return connect(client)
  })
