import type {DefineTest} from '@alinea/suite'
import type {Database} from '#/core/Database.ts'
import {eq} from '#/index.ts'
import {User, users} from './Fixtures.ts'

export function testORMQueries(db: Database, test: DefineTest) {
  test('find, nullable first, and count use ordinary queries', async () => {
    await db.insert(users).values([{name: 'Ada'}, {name: 'Grace'}])

    const found = await db.find(User, {where: eq(User.name, 'Ada')})
    test.equal(found, [{id: 1, name: 'Ada', email: null, loginCount: 0}])
    test.equal(await db.first(User, {where: eq(User.id, 999)}), null)
    test.equal(await db.count(User, {where: eq(User.name, 'Ada')}), 1)
  })
}
