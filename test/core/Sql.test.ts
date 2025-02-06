import {sql} from '@/core/Sql.ts'
import {suite} from '@alinea/suite'
import {emit} from '../TestUtils.ts'

suite(import.meta, test => {
  test('value', () => {
    test.equal(emit(sql.value(1)), '1')
  })

  test('placeholder', () => {
    test.equal(emit(sql.placeholder('name')), '?name')
  })

  test('identifier', () => {
    test.equal(emit(sql.identifier('name')), '"name"')
  })

  test('inline value', () => {
    test.equal(emit(sql.inline(1)), '1')
  })

  test('unknown values', () => {
    test.equal(emit(sql`${1}`), '1')
    test.equal(emit(sql`${null}`), 'null')
    test.equal(emit(sql`${'"'}`), JSON.stringify('"'))
  })
})
