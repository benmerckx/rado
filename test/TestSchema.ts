import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {Query, column, table} from '../src'
import {Schema} from '../src/Schema'
import {connect} from './DbSuite'

const columns = {
  id: column.integer().primaryKey(),
  index: column.integer(),
  bool: column.boolean(),
  string: column.string(),
  number: column.number(),
  array: column.array(),
  object: column.object(),
  nullableCol: column.string().nullable(),
  defaultString: column.string().defaultValue("'with quotes'"),
  defaultNumber: column.number().defaultValue(123),
  defaultBoolean: column.boolean().defaultValue(true),
  defaultBoolean2: column.boolean().defaultValue(false),
  defaultFloat: column.number().defaultValue(1.23),
  defaultArray: column.array().defaultValue([1, 2, 3]),
  defaultObject: column.object().defaultValue({a: 1, b: 2, c: 3})
}

const TestTable = table({
  name: 'test',
  columns
})

test('Schema', async () => {
  const query = await connect()
  await query(TestTable.createTable())
  assert.equal(await query.schema('test'), TestTable.schema())
})

test('Add col', async () => {
  const TestTable2 = table({
    name: 'test',
    columns: {
      ...columns,
      newCol: column.string()
    }
  })
  const changes = Schema.diff(TestTable.schema(), TestTable2.schema())
  assert.equal(changes, [
    Query.AlterTable({
      table: TestTable2.schema(),
      addColumn: TestTable2.schema().columns.newCol
    })
  ])
})

test('Remove col', async () => {
  const {array, ...restColumns} = columns
  const TestTable2 = table({
    name: 'test',
    columns: restColumns
  })
  const changes = Schema.diff(TestTable.schema(), TestTable2.schema())
  assert.equal(changes, [
    Query.AlterTable({
      table: TestTable2.schema(),
      dropColumn: TestTable.schema().columns.array
    })
  ])
})

test('Alter col', async () => {
  const TestTable2 = table({
    name: 'test',
    columns: {
      ...columns,
      array: column.array().defaultValue([3, 2, 1])
    }
  })
  const changes = Schema.diff(TestTable.schema(), TestTable2.schema())
  assert.equal(changes, [
    Query.AlterTable({
      table: TestTable2.schema(),
      alterColumn: [
        TestTable2.schema().columns.array,
        TestTable.schema().columns.array
      ]
    })
  ])
})

test.run()
