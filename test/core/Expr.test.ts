import {Assert, Test} from '@sinclair/carbon'
import {sql} from '../../src/core/Sql.ts'
import * as e from '../../src/core/expr/Conditions.ts'
import {emit} from '../TestUtils.ts'

Test.describe('Expr', () => {
  Test.it('eq', () => {
    Assert.isEqual(emit(e.eq(1, 1)), '1 = 1')
  })

  Test.it('ne', () => {
    Assert.isEqual(emit(e.ne(1, 1)), '1 <> 1')
  })

  Test.it('and', () => {
    Assert.isEqual(emit(e.and(true, false, true)), '(true and false and true)')
  })

  Test.it('or', () => {
    Assert.isEqual(emit(e.or(true, false, true)), '(true or false or true)')
  })

  Test.it('not', () => {
    Assert.isEqual(emit(e.not(true)), 'not true')
  })

  Test.it('gt', () => {
    Assert.isEqual(emit(e.gt(1, 2)), '1 > 2')
  })

  Test.it('gte', () => {
    Assert.isEqual(emit(e.gte(1, 2)), '1 >= 2')
  })

  Test.it('lt', () => {
    Assert.isEqual(emit(e.lt(1, 2)), '1 < 2')
  })

  Test.it('lte', () => {
    Assert.isEqual(emit(e.lte(1, 2)), '1 <= 2')
  })

  Test.it('inArray', () => {
    Assert.isEqual(emit(e.inArray(1, [1, 2, 3])), '1 in (1, 2, 3)')
  })

  Test.it('notInArray', () => {
    Assert.isEqual(emit(e.notInArray(1, [1, 2, 3])), '1 not in (1, 2, 3)')
  })

  Test.it('like', () => {
    Assert.isEqual(emit(e.like('a', 'b')), '"a" like "b"')
  })

  Test.it('notLike', () => {
    Assert.isEqual(emit(e.notLike('a', 'b')), '"a" not like "b"')
  })

  Test.it('isNull', () => {
    Assert.isEqual(emit(e.isNull('a')), '"a" is null')
  })

  Test.it('isNotNull', () => {
    Assert.isEqual(emit(e.isNotNull('a')), '"a" is not null')
  })

  Test.it('between', () => {
    Assert.isEqual(emit(e.between(1, 2, 3)), '1 between 2 and 3')
  })

  Test.it('notBetween', () => {
    Assert.isEqual(emit(e.notBetween(1, 2, 3)), '1 not between 2 and 3')
  })

  Test.it('ilike', () => {
    Assert.isEqual(emit(e.ilike('a', 'b')), '"a" ilike "b"')
  })

  Test.it('notIlike', () => {
    Assert.isEqual(emit(e.notILike('a', 'b')), '"a" not ilike "b"')
  })

  Test.it('arrayContains', () => {
    Assert.isEqual(emit(e.arrayContains(['a'], 'a')), '["a"] @> "a"')
  })

  Test.it('arrayContained', () => {
    Assert.isEqual(emit(e.arrayContained('a', ['a', 'b'])), '"a" <@ ["a","b"]')
  })

  Test.it('arrayOverlaps', () => {
    Assert.isEqual(emit(e.arrayOverlaps(['a'], ['b'])), '["a"] && ["b"]')
  })

  Test.it('order by', () => {
    const a = sql`test`
    Assert.isEqual(emit(e.asc(a)), 'test asc')
    Assert.isEqual(emit(e.desc(a)), 'test desc')
  })

  Test.it('json array', () => {
    const arr = e.jsonExpr(sql<Array<number> | null>`test`)
    const row = arr[0]
    Assert.isEqual(emit(row), 'test->>"$.0"')
  })

  Test.it('json object', () => {
    const obj = e.jsonExpr(sql<{a: {x: number}} | null>`test`)
    const a = obj.a
    const x = obj.a.x
    Assert.isEqual(emit(x), 'test->>"$.a.x"')
  })
})
