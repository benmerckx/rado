import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {Table, column, table} from '../src/index'

const Table1 = table({
  Table1_test: {
    id: column.integer().primaryKey<'Table1'>()
  }
})

const Table2 = table({
  Table2_test: {
    id: column.integer().primaryKey<'Table2'>(),
    name: column.string(),
    length: column.integer()
  }
})

const Table3 = table({
  Table3_test: {
    name: column.string()
  }
})

test('Available metadata', async () => {
  assert.is(Table1[Table.Data].name, 'Table1_test')
  assert.is(Table2[Table.Data].name, 'Table2_test')
  assert.equal(
    {...Table2},
    {id: Table2.id, name: Table2.name, length: Table2.length}
  )
  assert.equal({...Table3}, {name: Table2.name})
})

test.run()
