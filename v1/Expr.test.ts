import {expect, test} from 'bun:test'
import * as e from './Expr.ts'
import {sql} from './Sql.ts'

test('eq', () => {
  expect(sql.inline(e.eq(1, 1))).toBe('1 = 1')
})

test('ne', () => {
  expect(sql.inline(e.ne(1, 1))).toBe('1 <> 1')
})

test('and', () => {
  expect(sql.inline(e.and(true, false, true))).toBe('(true and false and true)')
})

test('or', () => {
  expect(sql.inline(e.or(true, false, true))).toBe('(true or false or true)')
})

test('not', () => {
  expect(sql.inline(e.not(true))).toBe('not true')
})

test('gt', () => {
  expect(sql.inline(e.gt(1, 2))).toBe('1 > 2')
})

test('gte', () => {
  expect(sql.inline(e.gte(1, 2))).toBe('1 >= 2')
})

test('lt', () => {
  expect(sql.inline(e.lt(1, 2))).toBe('1 < 2')
})

test('lte', () => {
  expect(sql.inline(e.lte(1, 2))).toBe('1 <= 2')
})

test('inArray', () => {
  expect(sql.inline(e.inArray(1, [1, 2, 3]))).toBe('1 in (1, 2, 3)')
})

test('notInArray', () => {
  expect(sql.inline(e.notInArray(1, [1, 2, 3]))).toBe('1 not in (1, 2, 3)')
})

test('like', () => {
  expect(sql.inline(e.like('a', 'b'))).toBe('"a" like "b"')
})

test('notLike', () => {
  expect(sql.inline(e.notLike('a', 'b'))).toBe('"a" not like "b"')
})

test('isNull', () => {
  expect(sql.inline(e.isNull('a'))).toBe('"a" is null')
})

test('ilike', () => {
  expect(sql.inline(e.ilike('a', 'b'))).toBe('"a" ilike "b"')
})

test('notIlike', () => {
  expect(sql.inline(e.notILike('a', 'b'))).toBe('"a" not ilike "b"')
})

test('arrayContains', () => {
  expect(sql.inline(e.arrayContains(['a'], 'a'))).toBe('["a"] @> "a"')
})

test('arrayContained', () => {
  expect(sql.inline(e.arrayContained('a', ['a', 'b']))).toBe('"a" <@ ["a","b"]')
})

test('arrayOverlaps', () => {
  expect(sql.inline(e.arrayOverlaps(['a'], ['b']))).toBe('["a"] && ["b"]')
})
