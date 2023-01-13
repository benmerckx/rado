import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, index, table} from '../src'
import {datetime} from '../src/sqlite'
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
  defaultObject: column.object().defaultValue({a: 1, b: 2, c: 3}),
  createdAt: column.string().defaultValue(datetime('now', 'localtime'))
}

const TestTable = table({
  name: 'test',
  columns
})

const query = await connect()

test('Add col', async () => {
  const createdAt = column.string().defaultValue(datetime('now', 'localtime'))
  const Start = table({
    name: 'test',
    columns: {
      id: column.integer().primaryKey(),
      createdAt,
      text: column.string()
    }
  })
  await query(Start.createTable())
  const AddCol = table({
    name: 'test',
    columns: {
      id: column.integer().primaryKey(),
      createdAt,
      newCol: column.string()
    },
    indexes() {
      return {
        newCol: index(this.newCol),
        multiple: index(this.newCol.concat('inline parameter test'))
      }
    }
  })
  await query.migrateSchema(AddCol)
  await query(
    AddCol.insertOne({
      newCol: 'new'
    })
  )
  const rowOne = await query(
    AddCol.select({id: AddCol.id, newCol: AddCol.newCol}).first()
  )
  assert.equal(rowOne, {id: 1, newCol: 'new'})
})

test.run()
