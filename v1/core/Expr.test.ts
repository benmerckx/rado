import {expect, test} from 'bun:test'
import * as e from './Expr.ts'
import {sql} from './Sql.ts'

test('eq', () => {
  expect(sql.test(e.eq(1, 1))).toBe('1 = 1')
})

test('ne', () => {
  expect(sql.test(e.ne(1, 1))).toBe('1 <> 1')
})

test('and', () => {
  expect(sql.test(e.and(true, false, true))).toBe('(true and false and true)')
})

test('or', () => {
  expect(sql.test(e.or(true, false, true))).toBe('(true or false or true)')
})

test('not', () => {
  expect(sql.test(e.not(true))).toBe('not true')
})

test('gt', () => {
  expect(sql.test(e.gt(1, 2))).toBe('1 > 2')
})

test('gte', () => {
  expect(sql.test(e.gte(1, 2))).toBe('1 >= 2')
})

test('lt', () => {
  expect(sql.test(e.lt(1, 2))).toBe('1 < 2')
})

test('lte', () => {
  expect(sql.test(e.lte(1, 2))).toBe('1 <= 2')
})

test('inArray', () => {
  expect(sql.test(e.inArray(1, [1, 2, 3]))).toBe('1 in (1, 2, 3)')
})

test('notInArray', () => {
  expect(sql.test(e.notInArray(1, [1, 2, 3]))).toBe('1 not in (1, 2, 3)')
})

test('like', () => {
  expect(sql.test(e.like('a', 'b'))).toBe('"a" like "b"')
})

test('notLike', () => {
  expect(sql.test(e.notLike('a', 'b'))).toBe('"a" not like "b"')
})

test('isNull', () => {
  expect(sql.test(e.isNull('a'))).toBe('"a" is null')
})

test('isNotNull', () => {
  expect(sql.test(e.isNotNull('a'))).toBe('"a" is not null')
})

test('between', () => {
  expect(sql.test(e.between(1, 2, 3))).toBe('1 between 2 and 3')
})

test('notBetween', () => {
  expect(sql.test(e.notBetween(1, 2, 3))).toBe('1 not between 2 and 3')
})

test('ilike', () => {
  expect(sql.test(e.ilike('a', 'b'))).toBe('"a" ilike "b"')
})

test('notIlike', () => {
  expect(sql.test(e.notILike('a', 'b'))).toBe('"a" not ilike "b"')
})

test('arrayContains', () => {
  expect(sql.test(e.arrayContains(['a'], 'a'))).toBe('["a"] @> "a"')
})

test('arrayContained', () => {
  expect(sql.test(e.arrayContained('a', ['a', 'b']))).toBe('"a" <@ ["a","b"]')
})

test('arrayOverlaps', () => {
  expect(sql.test(e.arrayOverlaps(['a'], ['b']))).toBe('["a"] && ["b"]')
})

test('order by', () => {
  const a = sql`test`
  expect(sql.test(e.asc(a))).toBe('test asc')
  expect(sql.test(e.desc(a))).toBe('test desc')
})

test('json array', () => {
  const arr = e.expr.json(sql<Array<number> | null>`test`)
  const row = arr[0]
  expect(sql.test(row)).toBe('test->"$.0"')
})

test('json object', () => {
  const obj = e.expr.json(sql<{a: {x: number}} | null>`test`)
  const a = obj.a
  const x = obj.a.x
  expect(sql.test(x)).toBe('test->"$.a.x"')
})
