import {suite} from '@alinea/suite'
import * as mysql from '#/mysql/columns.ts'
import {columnSql, mapFrom, mapTo} from '../TestUtils.ts'

const test = suite(import.meta)

test('mysql basic scalar columns sql', () => {
  test.equal(columnSql(mysql.boolean()), 'boolean')
  test.equal(columnSql(mysql.blob()), 'blob')
  test.equal(columnSql(mysql.double()), 'double')
  test.equal(columnSql(mysql.float()), 'float')
  test.equal(columnSql(mysql.integer()), 'integer')
  test.equal(columnSql(mysql.int()), 'integer')
  test.equal(columnSql(mysql.real()), 'real')
  test.equal(columnSql(mysql.serial()), 'serial')
  test.equal(columnSql(mysql.text()), 'text')
  test.equal(columnSql(mysql.tinytext()), 'tinytext')
  test.equal(columnSql(mysql.mediumtext()), 'mediumtext')
  test.equal(columnSql(mysql.longtext()), 'longtext')
  test.equal(columnSql(mysql.year()), 'year')
})

test('mysql bigint mapping', () => {
  const big = mysql.bigint()
  const bigExplicit = mysql.bigint({mode: 'bigint'})
  const bigNum = mysql.bigint({mode: 'number'})
  const bigUnsigned = mysql.bigint({unsigned: true})
  test.equal(columnSql(big), 'bigint')
  test.equal(columnSql(bigExplicit), 'bigint')
  test.equal(columnSql(bigUnsigned), 'bigint unsigned')
  test.equal(mapFrom(big, '42'), BigInt('42'))
  test.equal(mapFrom(bigExplicit, '42'), BigInt('42'))
  test.equal(mapFrom(bigNum, '43'), 43)
})

test('mysql integer variants sql', () => {
  test.equal(columnSql(mysql.tinyint()), 'tinyint')
  test.equal(columnSql(mysql.tinyint({unsigned: true})), 'tinyint unsigned')
  test.equal(columnSql(mysql.smallint()), 'smallint')
  test.equal(columnSql(mysql.smallint({unsigned: true})), 'smallint unsigned')
  test.equal(columnSql(mysql.mediumint()), 'mediumint')
  test.equal(columnSql(mysql.mediumint({unsigned: true})), 'mediumint unsigned')
})

test('mysql char and varchar sql', () => {
  test.equal(columnSql(mysql.char()), 'char')
  test.equal(columnSql(mysql.char({length: 4})), 'char(4)')
  test.equal(columnSql(mysql.varchar()), 'varchar')
  test.equal(columnSql(mysql.varchar({length: 10})), 'varchar(10)')
})

test('mysql binary and varbinary sql', () => {
  test.equal(columnSql(mysql.binary()), 'binary')
  test.equal(columnSql(mysql.binary({length: 8})), 'binary(8)')
  test.equal(columnSql(mysql.varbinary()), 'varbinary')
  test.equal(columnSql(mysql.varbinary({length: 16})), 'varbinary(16)')
})

test('mysql decimal and numeric sql', () => {
  const decimal = mysql.decimal()
  const decimalNum = mysql.decimal({mode: 'number'})
  const decimalBig = mysql.decimal({mode: 'bigint'})
  test.equal(columnSql(decimal), 'decimal')
  test.equal(
    columnSql(mysql.decimal({precision: 10, scale: 2})),
    'decimal(10, 2)'
  )
  test.equal(mapFrom(decimal, '10.25'), '10.25')
  test.equal(mapFrom(decimalNum, '10.25'), 10.25)
  test.equal(mapFrom(decimalBig, '10'), BigInt('10'))
})

test('mysql json mapping', () => {
  const jsonCol = mysql.json<{foo: string}>()
  test.equal(columnSql(jsonCol), 'json')
  test.equal(mapTo(jsonCol, {foo: 'bar'}), JSON.stringify({foo: 'bar'}))
})

test('mysql date mapping', () => {
  const dateStr = mysql.date({mode: 'string'})
  const dateDate = mysql.date({mode: 'date'})
  test.equal(columnSql(dateStr), 'date')
  test.equal(mapFrom(dateStr, '2020-01-01'), '2020-01-01')
  test.ok(mapFrom(dateDate, '2020-01-01') instanceof Date)
  const date = new Date('2020-01-01T00:00:00.000Z')
  test.equal(mapTo(dateDate, date), date.toISOString())
})

test('mysql datetime mapping', () => {
  const dtStr = mysql.datetime({mode: 'string'})
  const dtExplicitDate = mysql.datetime({mode: 'date'})
  const dtDate = mysql.datetime()
  test.equal(columnSql(dtStr), 'datetime')
  test.equal(mapFrom(dtStr, '2020-01-01 00:00:00'), '2020-01-01 00:00:00')
  test.ok(mapFrom(dtExplicitDate, '2020-01-01 00:00:00') instanceof Date)
  test.ok(mapFrom(dtDate, '2020-01-01 00:00:00') instanceof Date)
  const date = new Date('2020-01-01T00:00:00.000Z')
  test.equal(mapTo(dtDate, date), date.toISOString())
  test.equal(columnSql(mysql.datetime({fsp: 2})), 'datetime(2)')
})

test('mysql timestamp mapping', () => {
  const tsStr = mysql.timestamp({mode: 'string'})
  const tsExplicitDate = mysql.timestamp({mode: 'date'})
  const tsDate = mysql.timestamp()
  test.equal(columnSql(tsStr), 'timestamp')
  test.equal(mapFrom(tsStr, '2020-01-01 00:00:00'), '2020-01-01 00:00:00')
  test.ok(mapFrom(tsExplicitDate, '2020-01-01 00:00:00') instanceof Date)
  test.ok(mapFrom(tsDate, '2020-01-01 00:00:00') instanceof Date)
  const date = new Date('2020-01-01T00:00:00.000Z')
  test.equal(mapTo(tsDate, date), '2020-01-01 00:00:00.000')
  test.equal(columnSql(mysql.timestamp({fsp: 3})), 'timestamp(3)')
})

test('mysql time sql', () => {
  test.equal(columnSql(mysql.time()), 'time')
  test.equal(columnSql(mysql.time({fsp: 4})), 'time(4)')
})
