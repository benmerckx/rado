import {sql} from '../../src/core/Sql.ts'
import {suite} from '../Suite.ts'
import {emit} from '../TestUtils.ts'

suite(import.meta, ({test, isEqual}) => {
  test('value', () => {
    isEqual(emit(sql.empty().value(1)), '1')
  })

  test('placeholder', () => {
    isEqual(emit(sql.empty().placeholder('name')), '?name')
  })

  test('identifier', () => {
    isEqual(emit(sql.empty().identifier('name')), '"name"')
  })

  test('inline value', () => {
    isEqual(emit(sql.empty().inline(1)), '1')
  })
})
