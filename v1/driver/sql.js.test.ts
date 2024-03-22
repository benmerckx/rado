import {test} from 'bun:test'
import init from 'sql.js'
import {testCreate} from './DriverTests.ts'
import {connect} from './sql.js.ts'

const {Database} = await init()
const db = connect(new Database())

test('create table', testCreate(db))
