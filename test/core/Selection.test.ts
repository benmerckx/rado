import {selection} from '../../src/core/Selection.ts'
import {sql} from '../../src/core/Sql.ts'
import {emit} from '../TestUtils.ts'
import {suite} from '../suite.ts'

suite(import.meta, ({test, isEqual}) => {
  test('alias', () => {
    const aliased = selection(sql.value(1).as('name'))
    isEqual(emit(aliased), '1 as "name"')
  })
})
