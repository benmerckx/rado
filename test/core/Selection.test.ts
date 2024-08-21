import {selection, sql} from '@/index.ts'
import {suite} from '@benmerckx/suite'
import {emit} from '../TestUtils.ts'

suite(import.meta, test => {
  test('alias', () => {
    const aliased = selection(sql.value(1).as('name'))
    test.equal(emit(aliased), '1 as "name"')
  })
})
