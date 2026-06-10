import {suite} from '@alinea/suite'
import {getSelection} from '@/core/Internal.ts'
import {eq, selection, sql, table} from '@/index.ts'
import {integer, text} from '@/universal.ts'
import {builder} from '../TestUtils.ts'
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

  test('left joined subquery nested object becomes null', () => {
    const City = table('City', {
      id: integer().primaryKey(),
      name: text()
    })
    const User = table('User', {
      id: integer().primaryKey(),
      cityId: integer(),
      name: text()
    })
    const user = builder
      .select({id: User.id, name: User.name, cityId: User.cityId})
      .from(User)
      .as('user')
    const query = builder
      .select({
        city: {
          id: City.id,
          name: City.name
        },
        user: {
          id: user.id,
          name: user.name
        }
      })
      .from(City)
      .leftJoin(user, eq(user.cityId, City.id))
    const selected = getSelection(query)
    test.equal(
      selected.mapRow({
        values: [1, 'Paris', null, null],
        index: 0,
        specs: {parsesJson: false, supportsTransactions: true}
      }),
      {
        city: {id: 1, name: 'Paris'},
        user: null
      }
    )
  })
})
