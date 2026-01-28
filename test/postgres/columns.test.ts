import {pgEnum, pgSchema} from '@/postgres.ts'
import * as pg from '@/postgres/columns.ts'
import {suite} from '@alinea/suite'
import {columnSql, mapFrom, mapTo} from '../TestUtils.ts'

const test = suite(import.meta)
test('pg basic scalar columns sql', () => {
  test.equal(columnSql(pg.boolean()), 'boolean')
  test.equal(columnSql(pg.bytea()), 'bytea')
  test.equal(columnSql(pg.cidr()), 'cidr')
  test.equal(columnSql(pg.inet()), 'inet')
  test.equal(columnSql(pg.oid()), 'oid')
  test.equal(columnSql(pg.uuid()), 'uuid')
  test.equal(columnSql(pg.text()), 'text')
  test.equal(columnSql(pg.integer()), 'integer')
  test.equal(columnSql(pg.int()), 'integer')
  test.equal(columnSql(pg.smallint()), 'smallint')
  test.equal(columnSql(pg.smallserial()), 'smallserial')
  test.equal(columnSql(pg.serial()), 'serial')
  test.equal(columnSql(pg.real()), 'real')
})

test('pg bigint and bigserial mapping', () => {
  const bigintCol = pg.bigint()
  const bigserialCol = pg.bigserial()
  test.equal(columnSql(bigintCol), 'bigint')
  test.equal(columnSql(bigserialCol), 'bigserial')
  test.equal(mapFrom(bigintCol, '42'), BigInt('42'))
  test.equal(mapFrom(bigserialCol, '43'), BigInt('43'))

  const bigintNum = pg.bigint(undefined, {mode: 'number'})
  const bigserialNum = pg.bigserial(undefined, {mode: 'number'})
  test.equal(mapFrom(bigintNum, '44'), 44)
  test.equal(mapFrom(bigserialNum, '45'), 45)
})

test('pg char and varchar sql', () => {
  test.equal(columnSql(pg.char()), 'character(1)')
  test.equal(columnSql(pg.char(undefined, {length: 4})), 'character(4)')
  test.equal(columnSql(pg.varchar({length: 10})), 'varchar(10)')
})

test('pg date mapping', () => {
  const dateStr = pg.date(undefined, {mode: 'string'})
  const dateDate = pg.date(undefined, {mode: 'date'})
  test.equal(columnSql(dateStr), 'date')
  test.equal(mapFrom(dateStr, '2020-01-01'), '2020-01-01')
  test.equal(mapFrom(dateDate, '2020-01-01'), Date.parse('2020-01-01'))
  const date = new Date('2020-01-01T00:00:00.000Z')
  test.equal(mapTo(dateDate, date), date.toISOString())
  test.equal(mapTo(dateDate, '2020-02-01'), '2020-02-01')
})

test('pg timestamp mapping', () => {
  const tsStr = pg.timestamp({mode: 'string'})
  const tsDate = pg.timestamp()
  test.equal(columnSql(tsStr), 'timestamp')
  test.equal(mapFrom(tsStr, '2020-01-01 00:00:00'), '2020-01-01 00:00:00')
  test.equal(
    mapFrom(tsDate, '2020-01-01T00:00:00.000Z'),
    Date.parse('2020-01-01T00:00:00.000Z')
  )
  const date = new Date('2020-01-01T00:00:00.000Z')
  test.equal(mapTo(tsDate, date), date.toISOString())
  test.equal(
    mapTo(tsDate, '2020-01-02T00:00:00.000Z'),
    '2020-01-02T00:00:00.000Z'
  )
  test.equal(
    columnSql(pg.timestamp({withTimeZone: true, precision: 3})),
    'timestamp with time zone(3)'
  )
  test.equal(
    columnSql(pg.timestamp({withTimezone: true})),
    'timestamp with time zone'
  )
})

test('pg time and interval sql', () => {
  test.equal(columnSql(pg.time()), 'time')
  test.equal(
    columnSql(pg.time({withTimeZone: true, precision: 2})),
    'time with time zone(2)'
  )
  test.equal(columnSql(pg.interval()), 'interval')
  test.equal(
    columnSql(pg.interval({fields: 'year to month', precision: 2})),
    'interval year to month(2)'
  )
})

test('pg numeric and double precision mapping', () => {
  test.equal(columnSql(pg.numeric()), 'numeric')
  test.equal(columnSql(pg.numeric({precision: 10, scale: 2})), 'numeric(10, 2)')
  test.equal(mapFrom(pg.numeric(), '1.25'), '1.25')
  test.equal(mapFrom(pg.numeric({mode: 'number'}), '1.25'), 1.25)
  test.equal(mapFrom(pg.numeric({mode: 'bigint'}), '42'), BigInt('42'))
  const dbl = pg.doublePrecision()
  test.equal(columnSql(dbl), 'double precision')
  test.equal(mapFrom(dbl, '1.5'), 1.5)
  test.equal(mapFrom(dbl, 2), 2)
  const real = pg.real()
  test.equal(mapFrom(real, '3.5'), 3.5)
  test.equal(mapFrom(real, 4), 4)
})

test('pg json and jsonb mapping', () => {
  const jsonCol = pg.json<{foo: string}>()
  const jsonbCol = pg.jsonb<{bar: string}>()
  const raw = JSON.stringify({foo: 'bar'})
  test.equal(mapTo(jsonCol, {foo: 'bar'}), raw)
  test.equal(
    mapFrom(jsonCol, raw, {parsesJson: false, supportsTransactions: true}),
    {
      foo: 'bar'
    }
  )
  test.equal(
    mapFrom(
      jsonCol,
      {foo: 'bar'},
      {parsesJson: true, supportsTransactions: true}
    ),
    {
      foo: 'bar'
    }
  )
  test.equal(mapTo(jsonbCol, {bar: 'baz'}), JSON.stringify({bar: 'baz'}))
  test.equal(
    mapFrom(jsonbCol, raw, {parsesJson: false, supportsTransactions: true}),
    {
      foo: 'bar'
    }
  )
})

test('pg network and mac address types sql', () => {
  test.equal(columnSql(pg.macaddr()), 'macaddr')
  test.equal(columnSql(pg.macaddr8()), 'macaddr8')
})

test('pg bit and varbit sql', () => {
  test.equal(columnSql(pg.bit()), 'bit')
  test.equal(columnSql(pg.bit({dimensions: 3})), 'bit(3)')
  test.equal(columnSql(pg.varbit()), 'varbit')
  test.equal(columnSql(pg.varbit({dimensions: 6})), 'varbit(6)')
})

test('pg point mapping', () => {
  const pointTuple = pg.point()
  const pointXY = pg.point({mode: 'xy'})
  test.equal(columnSql(pointTuple), 'point')
  test.equal(mapFrom(pointTuple, '(1,2)'), [1, 2])
  test.equal(mapFrom(pointXY, '(3,4)'), {x: 3, y: 4})
  test.equal(mapTo(pointTuple, [5, 6]), '(5,6)')
  test.equal(mapTo(pointXY, {x: 7, y: 8}), '(7,8)')
  test.equal(mapTo(pointTuple, '(9,10)'), '(9,10)')
})

test('pg line mapping', () => {
  const lineTuple = pg.line()
  const lineABC = pg.line({mode: 'abc'})
  test.equal(columnSql(lineTuple), 'line')
  test.equal(mapFrom(lineTuple, '{1,2,3}'), [1, 2, 3])
  test.equal(mapFrom(lineABC, '{4,5,6}'), {a: 4, b: 5, c: 6})
  test.equal(mapTo(lineTuple, [7, 8, 9]), '{7,8,9}')
  test.equal(mapTo(lineABC, {a: 1, b: 2, c: 3}), '{1,2,3}')
  test.equal(mapTo(lineTuple, '{3,2,1}'), '{3,2,1}')
})

test('pg geometry mapping', () => {
  const geomDefault = pg.geometry()
  const geomPointTuple = pg.geometry({type: 'point'})
  const geomPoint = pg.geometry({type: 'point', mode: 'xy'})
  const geomLine = pg.geometry({type: 'line'})
  test.equal(columnSql(geomDefault), 'geometry')
  test.equal(mapFrom(geomPointTuple, '(5,6)'), [5, 6])
  test.equal(columnSql(geomPoint), 'geometry(point)')
  test.equal(mapFrom(geomPoint, '(1,2)'), {x: 1, y: 2})
  test.equal(mapTo(geomPoint, {x: 3, y: 4}), '(3,4)')
  test.equal(mapFrom(geomLine, 'LINESTRING(0 0,1 1)'), 'LINESTRING(0 0,1 1)')
  test.equal(mapTo(geomLine, 'LINESTRING(0 0,1 1)'), 'LINESTRING(0 0,1 1)')
})

test('pg vector types sql', () => {
  test.equal(columnSql(pg.vector({dimensions: 3})), 'vector(3)')
  test.equal(columnSql(pg.halfvec({dimensions: 3})), 'halfvec(3)')
  test.equal(columnSql(pg.sparsevec({dimensions: 3})), 'sparsevec(3)')
})

test('pg enum column sql', () => {
  const mood = pgEnum('mood', ['sad', 'ok', 'happy'])
  test.equal(columnSql(mood()), '"mood"')
})

test('pg schema enum column sql', () => {
  const schema = pgSchema('custom')
  const colors = schema.enum('colors', ['red', 'green', 'blue'])
  test.equal(columnSql(colors()), '"custom"."colors"')
})

test('pg enum with schema arg sql', () => {
  const palette = pgEnum('palette', ['warm', 'cool'], 'paint')
  test.equal(columnSql(palette()), '"paint"."palette"')
})

test('pg column unique and array helpers', () => {
  const uniqueColumn = pg.integer().unique('uniq_test', {nulls: 'not distinct'})
  test.equal(columnSql(uniqueColumn), 'integer unique nulls not distinct')
  test.equal(columnSql(pg.integer().unique()), 'integer unique')

  const arraySized = pg.integer().array(3)
  test.equal(columnSql(arraySized!), 'integer[3]')

  const arrayUnsized = pg.integer().array()
  test.equal(columnSql(arrayUnsized!), 'integer[]')
})
