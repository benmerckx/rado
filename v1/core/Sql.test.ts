import {expect, test} from 'bun:test'
import {sql} from './Sql.ts'

test('value', () => {
  expect(sql.test(sql.empty().value(1))).toBe('1')
})

test('placeholder', () => {
  expect(sql.test(sql.empty().placeholder('name'))).toBe('?name')
})

test('identifier', () => {
  expect(sql.test(sql.empty().identifier('name'))).toBe('"name"')
})
