import {Assert, Test} from '@sinclair/carbon'
import {sql} from '../../src/core/Sql.ts'
import {emit} from '../TestUtils.ts'

Test.describe('Sql', () => {
  Test.it('value', () => {
    Assert.isEqual(emit(sql.empty().value(1)), '1')
  })

  Test.it('placeholder', () => {
    Assert.isEqual(emit(sql.empty().placeholder('name')), '?name')
  })

  Test.it('identifier', () => {
    Assert.isEqual(emit(sql.empty().identifier('name')), '"name"')
  })
})
