import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, table} from '../src/index'

const Table1 = table({
  Table1_test: {
    id: column.integer().primaryKey<'Table1'>()
  }
})

const Table2 = table({
  Table2_test: {
    id: column.integer().primaryKey<'Table2'>(),
    name: column.string()
  }
})

test('Available metadata', async () => {
  assert.is(Table1[table.data].name, 'Table1_test')
  assert.is(Table2[table.data].name, 'Table2_test')
})

test.run()
