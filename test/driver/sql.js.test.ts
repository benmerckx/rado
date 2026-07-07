import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'

const test = suite(import.meta)
const {'sql.js': connect} = await import('#/driver.ts')
const {default: init} = await import('sql.js')
const {Database} = await init()
const db = connect(new Database())
testDriver(db, test)
