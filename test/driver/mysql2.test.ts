import {connect} from '../../src/driver/mysql2.ts'
import {testDriver} from '../TestDriver.ts'
import {isDeno} from '../TestRuntime.ts'

if (!isDeno && process.env.CI)
  await testDriver(
    import.meta,
    async () => {
      const {default: mysql2} = await import('mysql2')
      const client = mysql2.createConnection(
        'mysql://root:mysql@0.0.0.0:3306/mysql'
      )
      return connect(client)
    },
    false
  )
