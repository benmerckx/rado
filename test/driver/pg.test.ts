import {Process, Runtime} from '@sinclair/carbon'
import {connect} from '../../src/driver/pg.ts'
import {testDriver} from '../TestDriver.ts'

if (!Runtime.isDeno() && Process.env.get('CI') === 'true')
  await testDriver('pg', async () => {
    const {default: pg} = await import('pg')
    const client = new pg.Client({
      connectionString: 'postgres://postgres:postgres@0.0.0.0:5432/postgres'
    })
    await client.connect()
    return connect(client)
  })
