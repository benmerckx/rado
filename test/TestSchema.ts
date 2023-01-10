import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, table} from '../src'
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

const query = await connect()

test('Add col', async () => {
  const Start = table({
    name: 'test',
    columns: {
      id: column.integer().primaryKey(),
      text: column.string()
    }
  })
  await query(Start.createTable())
  const AddCol = table({
    name: 'test',
    columns: {
      id: column.integer().primaryKey(),
      newCol: column.string()
    },
    indexes() {
      return {
        newCol: {on: [this.newCol]}
      }
    }
  })
  await query.migrateSchema(AddCol)
  await query(
    AddCol.insertOne({
      newCol: 'new'
    })
  )
  const rowOne = await query(AddCol.first())
  assert.equal(rowOne, {id: 1, newCol: 'new'})
})

test.run()
