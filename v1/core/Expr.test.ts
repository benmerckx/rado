import {expect, test} from 'bun:test'
import {emit} from '../test/TestUtils.ts'
import * as e from './Expr.ts'
import {sql} from './Sql.ts'

test('eq', () => {
  expect(emit(e.eq(1, 1))).toBe('1 = 1')
})

test('ne', () => {
  expect(emit(e.ne(1, 1))).toBe('1 <> 1')
})

test('and', () => {
  expect(emit(e.and(true, false, true))).toBe('(true and false and true)')
})

test('or', () => {
  expect(emit(e.or(true, false, true))).toBe('(true or false or true)')
})

test('not', () => {
  expect(emit(e.not(true))).toBe('not true')
})

test('gt', () => {
  expect(emit(e.gt(1, 2))).toBe('1 > 2')
})

test('gte', () => {
  expect(emit(e.gte(1, 2))).toBe('1 >= 2')
})

test('lt', () => {
  expect(emit(e.lt(1, 2))).toBe('1 < 2')
})

test('lte', () => {
  expect(emit(e.lte(1, 2))).toBe('1 <= 2')
})

test('inArray', () => {
  expect(emit(e.inArray(1, [1, 2, 3]))).toBe('1 in (1, 2, 3)')
})

test('notInArray', () => {
  expect(emit(e.notInArray(1, [1, 2, 3]))).toBe('1 not in (1, 2, 3)')
})

test('like', () => {
  expect(emit(e.like('a', 'b'))).toBe('"a" like "b"')
})

test('notLike', () => {
  expect(emit(e.notLike('a', 'b'))).toBe('"a" not like "b"')
})

test('isNull', () => {
  expect(emit(e.isNull('a'))).toBe('"a" is null')
})

test('isNotNull', () => {
  expect(emit(e.isNotNull('a'))).toBe('"a" is not null')
})

test('between', () => {
  expect(emit(e.between(1, 2, 3))).toBe('1 between 2 and 3')
})

test('notBetween', () => {
  expect(emit(e.notBetween(1, 2, 3))).toBe('1 not between 2 and 3')
})

test('ilike', () => {
  expect(emit(e.ilike('a', 'b'))).toBe('"a" ilike "b"')
})

test('notIlike', () => {
  expect(emit(e.notILike('a', 'b'))).toBe('"a" not ilike "b"')
})

test('arrayContains', () => {
  expect(emit(e.arrayContains(['a'], 'a'))).toBe('["a"] @> "a"')
})

test('arrayContained', () => {
  expect(emit(e.arrayContained('a', ['a', 'b']))).toBe('"a" <@ ["a","b"]')
})

test('arrayOverlaps', () => {
  expect(emit(e.arrayOverlaps(['a'], ['b']))).toBe('["a"] && ["b"]')
})

test('order by', () => {
  const a = sql`test`
  expect(emit(e.asc(a))).toBe('test asc')
  expect(emit(e.desc(a))).toBe('test desc')
})

test('json array', () => {
  const arr = e.dynamic(sql<Array<number> | null>`test`)
  const row = arr[0]
  expect(emit(row)).toBe('test->"$.0"')
})

test('json object', () => {
  const obj = e.dynamic(sql<{a: {x: number}} | null>`test`)
  const a = obj.a
  const x = obj.a.x
  expect(emit(x)).toBe('test->"$.a.x"')
})
