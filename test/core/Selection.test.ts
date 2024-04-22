import {Assert, Test} from '@sinclair/carbon'
import {selection} from '../../src/core/Selection.ts'
import {sql} from '../../src/core/Sql.ts'
import {emit} from '../TestUtils.ts'

Test.describe('Selection', () => {
  Test.it('alias', () => {
    const aliased = selection({id: sql.value(1).as('name')})
    Assert.isEqual(emit(aliased), '1 as "name"')
  })
})
