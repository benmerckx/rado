import {expect, test} from 'bun:test'
import {emit} from '../test/TestUtils.ts'
import {selection} from './Selection.ts'
import {sql} from './Sql.ts'

test('alias', () => {
  const aliased = selection({id: sql.value(1).as('name')})
  expect(emit(aliased)).toBe('1 as "name"')
})
