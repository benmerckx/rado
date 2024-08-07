import {suite} from '@benmerckx/suite'
import {selection} from '../../src/core/Selection.ts'
import {sql} from '../../src/core/Sql.ts'
import {emit} from '../TestUtils.ts'

suite(import.meta, test => {
  test('alias', () => {
    const aliased = selection(sql.value(1).as('name'))
    test.equal(emit(aliased), '1 as "name"')
  })
})
