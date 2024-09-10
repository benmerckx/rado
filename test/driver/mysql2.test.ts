import {testDriver} from '../TestDriver.ts'
import {isCi} from '../TestRuntime.ts'

if (isCi)
  await testDriver(
    import.meta,
    async () => {
      const driver = await import('../../src/driver.ts')
      const {default: mysql2} = await import('mysql2')
      const client = mysql2.createConnection(
        'mysql://root:mysql@0.0.0.0:3306/mysql'
      )
      return driver.mysql2(client)
    },
    false
  )
