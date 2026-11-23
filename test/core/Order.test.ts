import {suite} from '@alinea/suite'
import {hasCreate, hasDrop} from '#/core/Internal.ts'
import {members} from '#/core/Order.ts'
import {getTable, sql, type Table, table, view} from '#/index.ts'
import {pgSchema} from '#/postgres.ts'
import {sqliteDialect} from '#/sqlite/dialect.ts'
import {integer} from '#/universal.ts'
import {builder} from '../TestUtils.ts'

const test = suite(import.meta)

const options = {has: hasCreate, text: sqliteDialect.inline}

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

const names = (input: object) =>
  members(input, options).map(value => getTable(value as Table).name)

test('order around a foreign key cycle', () => {
  test.equal(names({Child, Other, B, A}), ['b', 'a', 'child', 'other'])
})

test('order views by the views they read', () => {
  const First = view('first').as(builder.select({id: Other.id}).from(Other))
  const Second = view('second').as(builder.select({id: First.id}).from(First))
  test.equal(
    members(
      {Second, Other, First},
      {
        has: hasCreate,
        text: sqliteDialect.inline
      }
    ),
    [Other, First, Second]
  )
})

test('order schemas before enums', () => {
  const app = pgSchema('app')
  const mood = app.enum('mood', ['a'])
  test.equal(members({mood, app}, options), [app, mood])
})

test('order views by their sources, not by aliases', () => {
  const Daily = view('b_daily').as(
    builder.select({a_summary: Other.id}).from(Other)
  )
  const Summary = view('a_summary').as(
    builder.select({id: Daily.a_summary}).from(Daily)
  )
  test.equal(members({Summary, Daily}, options), [Daily, Summary])
})

test('order raw sql views by name', () => {
  const First = view('raw_first', {id: integer()}).as(
    sql`select id as "raw_second" from other`
  )
  const Second = view('raw_second', {id: integer()}).as(
    sql`select "raw_first"."id" from "raw_first"`
  )
  test.equal(members({Second, First}, options), [First, Second])
  const Loop = view('raw_first', {id: integer()}).as(
    sql`select id from "raw_second"`
  )
  test.throws(
    () => members({Second, Loop}, options),
    'Views form a cycle between'
  )
})

test('drop leaves out schemas of a schema object', () => {
  const app = pgSchema('app')
  const Note = app.table('note', {id: integer()})
  const drop = {...options, has: hasDrop, drop: true}
  test.equal(members({app, Note}, drop), [Note])
  test.throws(() => members(Note, options), 'Expected a schema object')
})

test('order views past strings, ctes and functions', () => {
  const raw = (name: string, query: string) =>
    view(name, {id: integer()}).as(sql.unsafe(query))
  // Names inside string literals
  const A = raw('a', "select id from other where kind = 'b'")
  const B = raw('b', "select id from other where kind = 'a'")
  test.equal(members({B, A}, options), [B, A])
  // A common table expression shadows the view of its name
  const WithB = raw('a', 'with b as (select 1 as id) select id from b')
  const FromA = raw('b', 'select id from a')
  test.equal(members({FromA, WithB}, options), [WithB, FromA])
  // A function call isn't a view
  const Uses = raw('uses', 'select max(id) as id from other')
  const Max = raw('max', 'select id from uses')
  test.equal(members({Max, Uses}, options), [Uses, Max])
})
