import type {DefineTest} from '@alinea/suite'
import type {Database} from '#/core/Database.ts'
import {ormTests} from './Fixtures.ts'
import {testORMAliases} from './TestAliases.ts'
import {testORMPredicates} from './TestPredicates.ts'
import {testORMQueries} from './TestQueries.ts'
import {testORMRelations} from './TestRelations.ts'
import {testORMSave} from './TestSave.ts'

export function testORM(db: Database, test: DefineTest) {
  const orm = ormTests(db, test)
  testORMQueries(db, orm.test)
  testORMAliases(db, orm.test)
  testORMRelations(db, orm.test)
  testORMPredicates(db, orm.test)
  testORMSave(db, orm.test)
  return orm.cleanup
}
