import * as e from '@/core/expr/Conditions.ts'
import {jsonExpr} from '@/core/expr/Json.ts'
import {sql} from '@/index.ts'
import {suite} from '@alinea/suite'
import {builder, emit} from '../TestUtils.ts'

suite(import.meta, test => {
  test('eq', () => {
    test.equal(emit(e.eq(1, 1)), '1 = 1')
  })

  test('ne', () => {
    test.equal(emit(e.ne(1, 1)), '1 <> 1')
  })

  test('and', () => {
    test.equal(emit(e.and(true, false, true)), '(true and false and true)')
  })

  test('or', () => {
    test.equal(emit(e.or(true, false, true)), '(true or false or true)')
  })

  test('not', () => {
    test.equal(emit(e.not(true)), 'not true')
  })

  test('gt', () => {
    test.equal(emit(e.gt(1, 2)), '1 > 2')
  })

  test('gte', () => {
    test.equal(emit(e.gte(1, 2)), '1 >= 2')
  })

  test('lt', () => {
    test.equal(emit(e.lt(1, 2)), '1 < 2')
  })

  test('lte', () => {
    test.equal(emit(e.lte(1, 2)), '1 <= 2')
  })

  test('inArray', () => {
    test.equal(emit(e.inArray(1, [1, 2, 3])), '1 in (1, 2, 3)')
    const a = sql<string>`a`
    const b = sql<Array<string>>`b`
    test.equal(emit(e.inArray(a, b)), 'a in b')
    const q = builder.select(sql<string>`a`)
    test.equal(emit(e.inArray(a, q)), 'a in (select a)')
  })

  test('notInArray', () => {
    test.equal(emit(e.notInArray(1, [1, 2, 3])), '1 not in (1, 2, 3)')
    const a = sql<string>`a`
    const b = sql<Array<string>>`b`
    test.equal(emit(e.notInArray(a, b)), 'a not in b')
  })

  test('like', () => {
    test.equal(emit(e.like('a', 'b')), '"a" like "b"')
  })

  test('notLike', () => {
    test.equal(emit(e.notLike('a', 'b')), '"a" not like "b"')
  })

  test('isNull', () => {
    test.equal(emit(e.isNull('a')), '"a" is null')
  })

  test('isNotNull', () => {
    test.equal(emit(e.isNotNull('a')), '"a" is not null')
  })

  test('between', () => {
    test.equal(emit(e.between(1, 2, 3)), '1 between 2 and 3')
  })

  test('notBetween', () => {
    test.equal(emit(e.notBetween(1, 2, 3)), '1 not between 2 and 3')
  })

  test('ilike', () => {
    test.equal(emit(e.ilike('a', 'b')), '"a" ilike "b"')
  })

  test('notIlike', () => {
    test.equal(emit(e.notILike('a', 'b')), '"a" not ilike "b"')
  })

  test('arrayContains', () => {
    test.equal(emit(e.arrayContains(['a'], 'a')), '["a"] @> "a"')
  })

  test('arrayContained', () => {
    test.equal(emit(e.arrayContained(['a'], ['a', 'b'])), '["a"] <@ ["a","b"]')
  })

  test('arrayOverlaps', () => {
    test.equal(emit(e.arrayOverlaps(['a'], ['b'])), '["a"] && ["b"]')
  })

  test('order by', () => {
    const a = sql`test`
    test.equal(emit(e.asc(a)), 'test asc')
    test.equal(emit(e.desc(a)), 'test desc')
  })

  test('json array', () => {
    const arr = jsonExpr(sql<Array<number> | null>`test`)
    const row = arr[0]
    test.equal(emit(row), 'test->>"$.0"')
  })

  test('json object', () => {
    const obj = jsonExpr(sql<{a: {x: number}} | null>`test`)
    const a = obj.a
    const x = obj.a.x
    test.equal(emit(x), 'test->>"$.a.x"')
  })
})
