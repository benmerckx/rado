import {suite} from '@alinea/suite'
import {hasCreate} from '#/core/Internal.ts'
import {members} from '#/core/Order.ts'
import {getTable, type Table, table, view} from '#/index.ts'
import {pgSchema} from '#/postgres.ts'
import {integer} from '#/universal.ts'
import {builder} from '../TestUtils.ts'

const test = suite(import.meta)

const A = table('a', {
  id: integer().primaryKey(),
  b: integer().references((): any => B.id)
})
const B = table('b', {
  id: integer().primaryKey(),
  a: integer().references(A.id)
})
const Child = table('child', {a: integer().references(A.id)})
const Other = table('other', {id: integer()})

const names = (input: Array<object>) =>
  members(input, hasCreate).map(value => getTable(value as Table).name)

test('order around a foreign key cycle', () => {
  test.equal(names([{Child, Other, B, A}]), ['b', 'a', 'child', 'other'])
})

test('order views by the views they read', () => {
  const First = view('first').as(builder.select({id: Other.id}).from(Other))
  const Second = view('second').as(builder.select({id: First.id}).from(First))
  test.equal(members([{Second, Other, First}], hasCreate), [
    Other,
    First,
    Second
  ])
})

test('order schemas before enums', () => {
  const app = pgSchema('app')
  const mood = app.enum('mood', ['a'])
  test.equal(members([{mood, app}], hasCreate), [app, mood])
})
