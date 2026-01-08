import {suite} from '@alinea/suite'
import * as sqlite from '@/sqlite/columns.ts'
import {columnSql, mapFrom, mapTo} from '../../test/TestUtils.ts'

const test = suite(import.meta)

test('sqlite boolean mapping', () => {
  const col = sqlite.boolean()
  test.equal(columnSql(col), 'integer')
  test.equal(mapFrom(col, 1), true)
  test.equal(mapFrom(col, 0), false)
  test.equal(mapTo(col, true), 1)
  test.equal(mapTo(col, false), 0)
})

test('sqlite integer modes', () => {
  test.equal(columnSql(sqlite.integer()), 'integer')
  test.equal(columnSql(sqlite.integer({mode: 'number'})), 'integer')
  test.equal(columnSql(sqlite.integer({mode: 'boolean'})), 'integer')

  const ts = sqlite.integer({mode: 'timestamp'})
  const ms = sqlite.integer({mode: 'timestamp_ms'})
  test.equal(columnSql(ts), 'integer')
  test.equal(columnSql(ms), 'integer')
  const date = new Date('2020-01-01T00:00:00.000Z')
  test.equal(mapTo(ts, date), Math.floor(date.getTime() / 1000))
  test.equal(mapTo(ms, date), Math.floor(date.getTime()))
  test.equal(mapFrom(ts, 1), new Date(1000))
  test.equal(mapFrom(ms, 1), new Date(1))
  test.equal(mapFrom(ts, null), null)
})

test('sqlite blob modes', () => {
  test.equal(columnSql(sqlite.blob()), 'blob')

  const bigintCol = sqlite.blob({mode: 'bigint'})
  test.equal(columnSql(bigintCol), 'blob')
  test.equal(mapFrom(bigintCol, '42'), BigInt('42'))
  test.equal(mapTo(bigintCol, BigInt('43')), '43')

  const jsonCol = sqlite.blob<{foo: string}>({mode: 'json'})
  test.equal(columnSql(jsonCol), 'json')
  const jsonRaw = JSON.stringify({foo: 'bar'})
  test.equal(mapTo(jsonCol, {foo: 'bar'}), jsonRaw)
  test.equal(mapFrom(jsonCol, jsonRaw), {foo: 'bar'})

  const bufferCol = sqlite.blob({mode: 'buffer'})
  test.equal(columnSql(bufferCol), 'blob')
  const bytes = new Uint8Array([1, 2, 3])
  const buffer = bytes.buffer.slice(0)
  const fromView = mapFrom(bufferCol, bytes)
  test.ok(fromView instanceof ArrayBuffer)
  test.equal(new Uint8Array(fromView as ArrayBuffer), bytes)
  test.equal(mapFrom(bufferCol, buffer), buffer)
  test.equal(mapFrom(bufferCol, 'raw'), 'raw')
  const toView = mapTo(bufferCol, buffer)
  test.equal(toView, new Uint8Array(buffer))
})

test('sqlite text modes', () => {
  test.equal(columnSql(sqlite.text()), 'text')
  test.equal(columnSql(sqlite.text({mode: 'text', length: 5})), 'text(5)')
  test.equal(
    columnSql(sqlite.text({enum: ['a', 'b'] as const})),
    'text'
  )

  const jsonCol = sqlite.text<{foo: string}>({mode: 'json'})
  test.equal(columnSql(jsonCol), 'text')
  const jsonRaw = JSON.stringify({foo: 'bar'})
  test.equal(mapTo(jsonCol, {foo: 'bar'}), jsonRaw)
  test.equal(mapFrom(jsonCol, jsonRaw), {foo: 'bar'})
})

test('sqlite numeric and real sql', () => {
  test.equal(columnSql(sqlite.numeric()), 'numeric')
  test.equal(columnSql(sqlite.real()), 'real')
})

test('sqlite json and jsonb mapping', () => {
  const jsonCol = sqlite.json<{foo: string}>()
  const jsonbCol = sqlite.jsonb<{bar: string}>()
  const raw = JSON.stringify({foo: 'bar'})
  test.equal(columnSql(jsonCol), 'json')
  test.equal(columnSql(jsonbCol), 'jsonb')
  test.equal(mapTo(jsonCol, {foo: 'bar'}), raw)
  test.equal(mapFrom(jsonCol, raw), {foo: 'bar'})
  test.equal(mapTo(jsonbCol, {bar: 'baz'}), JSON.stringify({bar: 'baz'}))
  test.equal(mapFrom(jsonbCol, raw), {foo: 'bar'})
})
