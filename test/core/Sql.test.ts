import {suite} from '@benmerckx/suite'
import {sql} from '../../src/core/Sql.ts'
import {emit} from '../TestUtils.ts'

suite(import.meta, test => {
  test('value', () => {
    test.equal(emit(sql.empty().value(1)), '1')
  })

  test('placeholder', () => {
    test.equal(emit(sql.empty().placeholder('name')), '?name')
  })

  test('identifier', () => {
    test.equal(emit(sql.empty().identifier('name')), '"name"')
  })

  test('inline value', () => {
    test.equal(emit(sql.empty().inline(1)), '1')
  })
})
