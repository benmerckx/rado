import {Database} from 'bun:sqlite'
import {test} from 'bun:test'
import {testCreate} from './DriverTests.ts'
import {connect} from './bun-sqlite.ts'

const db = connect(new Database(':memory:'))

test('create table', testCreate(db))
