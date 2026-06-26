import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isBun} from '../TestRuntime.ts'

await testDriver(suite(import.meta), async () => {
  if (!isBun) return
  const {bun: connect} = await import('@/driver.ts')
  const {SQL} = await import('bun')
  try {
    const sql = new SQL('postgres://localhost:5432/test')
    return connect(sql, 'postgres')
  } catch (e) {
    return undefined
  }
})
