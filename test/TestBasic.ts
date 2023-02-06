import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {
  Expr,
  PrimaryKey,
  column,
  create,
  from,
  insertInto,
  table
} from '../src/index'
import {connect} from './DbSuite'

test.only('basic', async () => {
  const db = await connect()
  const Node = table('Node')(
    class Node {
      id = column.integer().primaryKey<'node'>()
      index = column.number()
    }
  )
  await create(Node).on(db)
  const amount = 10
  const objects = Array.from({length: amount}).map((_, index) => ({index}))
  assert.equal(objects.length, amount)
  await Node().insertAll(objects).on(db)
  assert.equal((await Node().on(db)).length, amount)
  const stored = await Node().on(db)
  const id = stored[amount - 1].id
  assert.equal(
    (
      await Node()
        .sure()
        .where(
          Node.index.isGreaterOrEqual(amount - 1),
          Node.index.isLess(amount)
        )
        .on(db)
    ).id,
    id
  )
})

test('filters', async () => {
  const db = await connect()
  const Test = table('Test')({
    id: column.integer().primaryKey(),
    prop: column.number()
  })
  await create(Test).on(db)
  const a = {prop: 10}
  const b = {prop: 20}
  await Test().insertAll([a, b]).on(db)
  const gt10 = await Test().where(Test.prop.isGreater(10)).sure().on(db)
  assert.equal(gt10.prop, 20)
})

test('select', async () => {
  const db = await connect()
  const Test = table('test')({
    id: column.integer().primaryKey(),
    propA: column.number(),
    propB: column.number()
  })
  await Test().create().on(db)
  const a = {propA: 10, propB: 5}
  const b = {propA: 20, propB: 5}
  await Test().insertAll([a, b]).on(db)
  const res = await Test().select({a: Test.propA, b: Test.propB}).on(db)
  assert.equal(res, [
    {a: 10, b: 5},
    {a: 20, b: 5}
  ])
  const res2 = await Test()
    .select({
      ...Test,
      testProp: Expr.value(123)
    })
    .sure()
    .on(db)

  assert.is(res2.testProp, 123)
  const res3 = await Test().sure().select(Expr.value('test')).on(db)
  assert.is(res3, 'test')
  const res4 = await Test().sure().select(Expr.value(true)).on(db)
  assert.is(res4, true)
})

test('update', async () => {
  const query = await connect()
  const Test = table('test')({
    id: column.integer().primaryKey<'test'>(),
    propA: column.number(),
    propB: column.number()
  })
  Test.id

  await query(Test().create())
  const a = {propA: 10, propB: 5}
  const b = {propA: 20, propB: 5}
  await query(Test().insertAll([a, b]))
  await query(Test().set({propA: 15}).where(Test.propA.is(10)))
  assert.ok(await query(Test().sure().where(Test.propA.is(15))))
})

test('json', async () => {
  const query = await connect()
  const Test = table('test')({
    id: column.integer().primaryKey(),
    prop: column.number(),
    propB: column.number()
  })
  await query(create(Test))
  const a = {prop: 10, propB: 5}
  const b = {prop: 20, propB: 5}
  await query(insertInto(Test).values(a, b))
  const q = Test({prop: 10})
    .select({
      fieldA: Expr.value(12),
      fieldB: Test.propB
    })
    .sure()
  const res1 = await query(q)
  assert.is(res1.fieldA, 12)
  assert.is(res1.fieldB, 5)
})

test('each', async () => {
  const query = await connect()
  const a = {
    refs: [
      {id: 1 as PrimaryKey<number, 'Entry'>, type: 'entry'},
      {id: 0 as PrimaryKey<number, 'Entry'>, type: 'nonsense'},
      {id: 2 as PrimaryKey<number, 'Entry'>, type: 'entry'}
    ]
  }
  const Test = table('test')({
    id: column.integer().primaryKey<'test'>(),
    refs: column.array<{
      id: PrimaryKey<number, 'Entry'>
      type: string
    }>()
  })
  type Test = table<typeof Test>

  const Entry = table('Entry')({
    id: column.integer().primaryKey<'Entry'>(),
    title: column.string()
  })
  type Entry = table<typeof Entry>

  await query(create(Test, Entry))
  await query(insertInto(Test).values(a))
  const res = await query(from(Test).select({refs: Test.refs}).first())
  assert.equal(res!, a)

  const b = {title: 'Entry B'}
  const c = {title: 'Entry C'}
  await query(create(Entry))
  await query(Entry().insertAll([b, c]))

  const Link = Entry().as('Link')
  const tests = Test()
    .select({
      links: Test.refs
        .filter(ref => {
          return ref.type.is('entry')
        })
        .map(ref => {
          return Link(Link.id.is(ref.id)).select({
            id: Link.id,
            title: Link.title
          })
        })
    })
    .sure()

  const res2 = await query(tests)
  assert.equal(res2.links, [
    {id: 1, title: 'Entry B'},
    {id: 2, title: 'Entry C'}
  ])
})

test.run()
