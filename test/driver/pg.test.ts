import {connect} from '../../src/driver/pg.ts'
import {isDeno} from '../Suite.ts'
import {testDriver} from '../TestDriver.ts'

if (!isDeno && process.env.CI)
  await testDriver(import.meta, async () => {
    const {default: pg} = await import('pg')
    const client = new pg.Client({
      connectionString: 'postgres://postgres:postgres@0.0.0.0:5432/postgres'
    })
    await client.connect()
    return connect(client)
  })
