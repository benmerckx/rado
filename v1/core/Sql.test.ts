import {expect, test} from 'bun:test'
import {emit} from '../test/TestUtils.ts'
import {sql} from './Sql.ts'

test('value', () => {
  expect(emit(sql.empty().value(1))).toBe('1')
})

test('placeholder', () => {
  expect(emit(sql.empty().placeholder('name'))).toBe('?name')
})

test('identifier', () => {
  expect(emit(sql.empty().identifier('name'))).toBe('"name"')
})
