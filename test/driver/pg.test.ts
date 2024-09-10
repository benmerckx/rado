import {testDriver} from '../TestDriver.ts'
import {isCi} from '../TestRuntime.ts'

if (isCi)
  await testDriver(import.meta, async () => {
    const driver = await import('../../src/driver.ts')
    const {default: pg} = await import('pg')
    const client = new pg.Client({
      connectionString: 'postgres://postgres:postgres@0.0.0.0:5432/postgres'
    })
    await client.connect()
    return driver.pg(client)
  })
