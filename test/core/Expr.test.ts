import {sql} from '../../src/core/Sql.ts'
import * as e from '../../src/core/expr/Conditions.ts'
import {jsonExpr} from '../../src/core/expr/Json.ts'
import {suite} from '../Suite.ts'
import {emit} from '../TestUtils.ts'

suite(import.meta, ({test, isEqual}) => {
  test('eq', () => {
    isEqual(emit(e.eq(1, 1)), '1 = 1')
  })

  test('ne', () => {
    isEqual(emit(e.ne(1, 1)), '1 <> 1')
  })

  test('and', () => {
    isEqual(emit(e.and(true, false, true)), '(true and false and true)')
  })

  test('or', () => {
    isEqual(emit(e.or(true, false, true)), '(true or false or true)')
  })

  test('not', () => {
    isEqual(emit(e.not(true)), 'not true')
  })

  test('gt', () => {
    isEqual(emit(e.gt(1, 2)), '1 > 2')
  })

  test('gte', () => {
    isEqual(emit(e.gte(1, 2)), '1 >= 2')
  })

  test('lt', () => {
    isEqual(emit(e.lt(1, 2)), '1 < 2')
  })

  test('lte', () => {
    isEqual(emit(e.lte(1, 2)), '1 <= 2')
  })

  test('inArray', () => {
    isEqual(emit(e.inArray(1, [1, 2, 3])), '1 in (1, 2, 3)')
    const a = sql<string>`a`
    const b = sql<Array<string>>`b`
    isEqual(emit(e.inArray(a, b)), 'a in b')
  })

  test('notInArray', () => {
    isEqual(emit(e.notInArray(1, [1, 2, 3])), '1 not in (1, 2, 3)')
    const a = sql<string>`a`
    const b = sql<Array<string>>`b`
    isEqual(emit(e.notInArray(a, b)), 'a not in b')
  })

  test('like', () => {
    isEqual(emit(e.like('a', 'b')), '"a" like "b"')
  })

  test('notLike', () => {
    isEqual(emit(e.notLike('a', 'b')), '"a" not like "b"')
  })

  test('isNull', () => {
    isEqual(emit(e.isNull('a')), '"a" is null')
  })

  test('isNotNull', () => {
    isEqual(emit(e.isNotNull('a')), '"a" is not null')
  })

  test('between', () => {
    isEqual(emit(e.between(1, 2, 3)), '1 between 2 and 3')
  })

  test('notBetween', () => {
    isEqual(emit(e.notBetween(1, 2, 3)), '1 not between 2 and 3')
  })

  test('ilike', () => {
    isEqual(emit(e.ilike('a', 'b')), '"a" ilike "b"')
  })

  test('notIlike', () => {
    isEqual(emit(e.notILike('a', 'b')), '"a" not ilike "b"')
  })

  test('arrayContains', () => {
    isEqual(emit(e.arrayContains(['a'], 'a')), '["a"] @> "a"')
  })

  test('arrayContained', () => {
    isEqual(emit(e.arrayContained(['a'], ['a', 'b'])), '["a"] <@ ["a","b"]')
  })

  test('arrayOverlaps', () => {
    isEqual(emit(e.arrayOverlaps(['a'], ['b'])), '["a"] && ["b"]')
  })

  test('order by', () => {
    const a = sql`test`
    isEqual(emit(e.asc(a)), 'test asc')
    isEqual(emit(e.desc(a)), 'test desc')
  })

  test('json array', () => {
    const arr = jsonExpr(sql<Array<number> | null>`test`)
    const row = arr[0]
    isEqual(emit(row), 'test->>"$.0"')
  })

  test('json object', () => {
    const obj = jsonExpr(sql<{a: {x: number}} | null>`test`)
    const a = obj.a
    const x = obj.a.x
    isEqual(emit(x), 'test->>"$.a.x"')
  })
})
