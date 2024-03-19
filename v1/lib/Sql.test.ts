import {expect, test} from 'bun:test'
import {sql} from './Sql.ts'

test('value', () => {
  expect(sql.inline(sql.empty().value(1))).toBe('1')
})

test('placeholder', () => {
  expect(sql.inline(sql.empty().placeholder('name'))).toBe('?name')
})

test('identifier', () => {
  expect(sql.inline(sql.empty().identifier('name'))).toBe('"name"')
})
