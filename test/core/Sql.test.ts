import {suite} from '@alinea/suite'
import {sql} from '#/core/Sql.ts'
import {table} from '#/core/Table.ts'
import {integer} from '#/universal.ts'
import {emit} from '../TestUtils.ts'

suite(import.meta, test => {
  test('value', () => {
    test.equal(emit(sql.value(1)), '1')
  })

  test('placeholder', () => {
    test.equal(emit(sql.placeholder('name')), '?name')
  })

  test('identifier', () => {
    test.equal(emit(sql.identifier('name')), '"name"')
  })

  test('function name', () => {
    test.equal(emit(sql.functionName('count')), 'count')
    test.throws(() => emit(sql.functionName('count); drop table users; --')))
  })

  test('inline value', () => {
    test.equal(emit(sql.inline(1)), '1')
  })

  test('unknown values', () => {
    test.equal(emit(sql`${1}`), '1')
    test.equal(emit(sql`${null}`), 'null')
    test.equal(emit(sql`${'"'}`), JSON.stringify('"'))
  })

  test('target aliases are scoped and preserve sql metadata', () => {
    const Item = table('item', {id: integer()})
    const expression = sql<number>`${Item.id}`.as('value').mapWith(Number)
    const aliased = expression.scopeTarget('item', 'related')

    test.equal(emit(aliased), '"related"."id"')
    test.equal(aliased.alias, 'value')
    test.equal(aliased.mapFromDriverValue?.('2', {} as never), 2)
    test.equal(emit(Item.id), '"item"."id"')
  })
})
