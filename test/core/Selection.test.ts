import {selection, sql} from '@/index.ts'
import {suite} from '@alinea/suite'
import {emit} from '../TestUtils.ts'

suite(import.meta, test => {
  test('alias', () => {
    const aliased = selection(sql.value(1).as('name'))
    test.equal(emit(aliased), '1 as "name"')
  })

  test('empty object', () => {
    const x = selection({
      x: sql.value(1),
      test: {},
      y: sql.value(2)
    })
    test.equal(emit(x), '1 as "x", 2 as "y"')
  })
})
