import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, index, table} from '../src/index'
import {datetime} from '../src/sqlite'
import {connect} from './DbSuite'

const columns = {
  id: column.integer.primaryKey(),
  index: column.integer,
  bool: column.boolean,
  string: column.string,
  number: column.number,
  array: column.array,
  object: column.object,
  nullableCol: column.string.nullable,
  nullableArray: column.array<number>().nullable(),
  defaultString: column.string.defaultValue("'with quotes'"),
  defaultNumber: column.number.defaultValue(123),
  defaultBoolean: column.boolean.defaultValue(true),
  defaultBoolean2: column.boolean.defaultValue(false),
  defaultFloat: column.number.defaultValue(1.23),
  defaultArray: column.array.defaultValue([1, 2, 3]),
  defaultObject: column.object.defaultValue({a: 1, b: 2, c: 3}),
  createdAt: column.string.defaultValue(datetime('now', 'localtime'))
}

const TestTable = table({Test: columns})

test('Create table', async () => {
  const db = await connect()
  await TestTable().create().on(db)
})

test('Add col', async () => {
  const db = await connect()
  await TestTable().create().on(db)
  const createdAt = column.string().defaultValue(datetime('now', 'localtime'))
  const Start = table({
    test: {
      id: column.integer().primaryKey(),
      createdAt,
      text: column.string().nullable()
    }
  })
  await db.migrateSchema(Start)
  await Start().insertOne({text: '123'}).on(db)
  const AddCol = table({
    test: class AddCol {
      id = column.integer().primaryKey<AddCol>()
      createdAt = createdAt
      text = column.number().defaultValue(2)
      newCol = column.string().defaultValue('def')
      def = column.string().defaultValue(() => 'test')
      isFalse = column.boolean().defaultValue(false)

      protected [table.meta]() {
        return {
          indexes: {
            newCol: index(this.newCol),
            multiple: index(this.newCol.concat('inline parameter test'))
          }
        }
      }
    }
  })
  await db.migrateSchema(AddCol)
  await AddCol().delete().on(db)
  await AddCol()
    .insertOne({
      text: 1,
      newCol: 'new'
    })
    .on(db)
  const rowOne = await AddCol()
    .select({id: AddCol.id, newCol: AddCol.newCol})
    .first()
    .on(db)
  assert.equal(rowOne, {id: 1, newCol: 'new'})
})

test.run()
