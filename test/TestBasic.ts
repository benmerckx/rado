import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {Expr, column, create, insertInto, selectFirst, table} from '../src'
import {connect} from './DbSuite'

test('basic', async () => {
  const query = await connect()
  const Node = table({
    name: 'node',
    columns: {
      id: column.integer().primaryKey<'node'>(),
      index: column.number()
    }
  })
  await query(create(Node))
  const amount = 10
  const objects = Array.from({length: amount}).map((_, index) => ({index}))
  assert.equal(objects.length, amount)
  await query(Node.insertAll(objects))
  assert.equal((await query(Node)).length, amount)
  const stored = await query(Node)
  const id = stored[amount - 1].id
  assert.equal(
    (await query(
      Node.first().where(
        Node.index.greaterOrEqual(amount - 1),
        Node.index.less(amount)
      )
    ))!.id,
    id
  )
})

test('filters', async () => {
  const query = await connect()
  const Test = table({
    name: 'test',
    columns: {
      id: column.integer().primaryKey(),
      prop: column.number()
    }
  })
  await query(create(Test))
  const a = {prop: 10}
  const b = {prop: 20}
  await query(Test.insertAll([a, b]))
  const gt10 = (await query.get(Test.where(Test.prop.greater(10))))!
  assert.equal(gt10.prop, 20)
})

test('select', async () => {
  const query = await connect()
  const Test = table({
    name: 'test',
    columns: {
      id: column.integer().primaryKey(),
      propA: column.number(),
      propB: column.number()
    }
  })
  await query(create(Test))
  const a = {propA: 10, propB: 5}
  const b = {propA: 20, propB: 5}
  await query(Test.insertAll([a, b]))
  const res = await query(Test.select({a: Test.propA, b: Test.propB}))
  assert.equal(res, [
    {a: 10, b: 5},
    {a: 20, b: 5}
  ])
  const res2 = (await query(
    Test.select({
      ...Test,
      testProp: Expr.value(123)
    }).first()
  ))!
  assert.is(res2.testProp, 123)
  const res3 = await query(Test.first().select(Expr.value('test')))!
  assert.is(res3, 'test')
  const res4 = await query(Test.first().select(Expr.value(true)))!
  assert.is(res4, true)
})

test('update', async () => {
  const query = await connect()
  const Test = table({
    name: 'test',
    columns: {
      id: column.integer().primaryKey<'test'>(),
      propA: column.number(),
      propB: column.number()
    }
  })
  Test.id

  await query(Test.createTable())
  const a = {propA: 10, propB: 5}
  const b = {propA: 20, propB: 5}
  await query(Test.insertAll([a, b]))
  await query(Test.set({propA: 15}).where(Test.propA.is(10)))
  assert.ok(await query(Test.first().where(Test.propA.is(15))))
})

test('json', async () => {
  const query = await connect()
  const Test = table({
    name: 'test',
    columns: {
      id: column.integer().primaryKey(),
      prop: column.number(),
      propB: column.number()
    }
  })
  await query(create(Test))
  const a = {prop: 10, propB: 5}
  const b = {prop: 20, propB: 5}
  await query(insertInto(Test).values(a, b))
  const q = Test.first()
    .select({
      fieldA: Expr.value(12),
      fieldB: Test.propB
    })
    .where(Test.prop.is(10))
  const res1 = await query(q)!
  assert.is(res1.fieldA, 12)
  assert.is(res1.fieldB, 5)
})

test('each', async () => {
  const query = await connect()
  const a = {
    refs: [
      {id: 1, type: 'entry'},
      {id: 0, type: 'nonsense'},
      {id: 2, type: 'entry'}
    ]
  }
  const Test = table({
    name: 'test',
    columns: {
      id: column.integer().primaryKey<'test'>(),
      refs: column.array<{id: number; type: string}>()
    }
  })
  type Test = table.infer<typeof Test>

  const Entry = table({
    name: 'Entry',
    columns: {
      id: column.integer().primaryKey<'Entry'>(),
      title: column.string()
    }
  })
  type Entry = table.infer<typeof Entry>

  await query(create(Test, Entry))
  await query(insertInto(Test).values(a))
  const res = await query(selectFirst(Test).select({refs: Test.refs}))
  assert.equal(res!, a)

  const b = {title: 'Entry B'}
  const c = {title: 'Entry C'}
  await query(create(Entry))
  await query(Entry.insertAll([b, c]))

  const Link = Entry.as('Link')
  const tests = Test.select({
    links: Test.refs
      .filter(ref => {
        return ref.type.is('entry')
      })
      .map(ref => {
        return Link.select({id: Link.id, title: Link.title})
          .where(Link.id.is(ref.id))
          .first()
      })
  }).first()

  const res2 = (await query(tests))!
  assert.equal(res2.links, [
    {id: 1, title: 'Entry B'},
    {id: 2, title: 'Entry C'}
  ])
})

test.run()
