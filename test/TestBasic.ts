import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, insertInto, selectFirst, update} from '../src'
import {collection} from '../src/Collection'
import {Expr} from '../src/Expr'
import {createConnection} from './DbSuite'

test('basic', () => {
  const query = createConnection()
  const Node = collection({
    name: 'node',
    columns: {
      id: column.string(),
      index: column.number()
    }
  })
  const amount = 10
  const objects = Array.from({length: amount}).map((_, index) => ({index}))
  assert.equal(objects.length, amount)
  query(Node.insertAll(objects))
  assert.equal(query(Node).length, amount)
  const stored = query(Node)
  const id = stored[amount - 1].id
  assert.equal(
    query(
      Node.first().where(
        Node.index.greaterOrEqual(amount - 1),
        Node.index.less(amount)
      )
    )!.id,
    id
  )
})

test('filters', () => {
  const query = createConnection()
  const Test = collection({
    name: 'test',
    columns: {
      id: column.string(),
      prop: column.number()
    }
  })
  const a = {prop: 10}
  const b = {prop: 20}
  query(Test.insertAll(a, b))
  const gt10 = query(Test.first().where(Test.prop.greater(10)))!
  assert.equal(gt10.prop, 20)
})

test('select', () => {
  const query = createConnection()
  const Test = collection({
    name: 'test',
    columns: {
      id: column.string(),
      propA: column.number(),
      propB: column.number()
    }
  })
  const a = {propA: 10, propB: 5}
  const b = {propA: 20, propB: 5}
  query(Test.insertAll(a, b))
  const res = query(Test.select({a: Test.propA, b: Test.propB}))
  assert.equal(res, [
    {a: 10, b: 5},
    {a: 20, b: 5}
  ])
  const res2 = query(
    Test.select({
      ...Test,
      testProp: Expr.value(123)
    }).first()
  )!
  assert.is(res2.testProp, 123)
  const res3 = query(Test.first().select(Expr.value('test')))!
  assert.is(res3, 'test')
  const res4 = query(Test.first().select(Expr.value(true)))!
  assert.is(res4, true)
})

test('update', () => {
  const query = createConnection()
  const Test = collection({
    name: 'test',
    columns: {
      id: column.string(),
      propA: column.number(),
      propB: column.number()
    }
  })
  const a = {propA: 10, propB: 5}
  const b = {propA: 20, propB: 5}
  query(insertInto(Test).values(a, b))
  query(update(Test).set({propA: 15}).where(Test.propA.is(10)))
  assert.ok(query(selectFirst(Test).where(Test.propA.is(15))))
})

/*test('query', () => {
  const db = store()
  const Test = collection<typeof a & {id: string}>('test')
  const a = {prop: 10, propB: 5}
  const b = {prop: 20, propB: 5}
  db.insertAll(Test, [a, b])
  type Input = {prop: number}
  const byProp = query(({prop}: Input) => Test.where(Test.prop.is(prop)))
  assert.is(db.first(byProp({prop: 10}))!.prop, 10)
  assert.is(db.first(byProp({prop: 20}))!.prop, 20)
})

test('case', () => {
  const db = store()
  type Test = {id: string} & ({type: 'A'; x: number} | {type: 'B'})
  const Test = collection<Test>('test')
  const a = {type: 'A', x: 1} as const
  const b = {type: 'B'} as const
  db.insertAll(Test, [a, b])
  assert.equal(
    db.all(
      Test.select(
        Test.type.case({
          A: Expr.value(1),
          B: Expr.value(2)
        })
      )
    ),
    [1, 2]
  )
})*/

test('json', () => {
  const query = createConnection()
  const Test = collection({
    name: 'test',
    columns: {
      id: column.string(),
      prop: column.number(),
      propB: column.number()
    }
  })
  const a = {prop: 10, propB: 5}
  const b = {prop: 20, propB: 5}
  query(insertInto(Test).values(a, b))
  const q = Test.first()
    .select({
      fieldA: Expr.value(12),
      fieldB: Test.propB
    })
    .where(Test.prop.is(10))
  const res1 = query(q)!
  assert.is(res1.fieldA, 12)
  assert.is(res1.fieldB, 5)
})

test('each', () => {
  const query = createConnection()
  const a = {
    refs: [
      {id: 'b', type: 'entry'},
      {id: 'c', type: 'entry'}
    ]
  }
  const Test = collection({
    name: 'test',
    columns: {
      id: column.string(),
      refs: column.array<{id: string; type: string}>()
    }
  })
  query(insertInto(Test).values(a))
  const res = query(selectFirst(Test).select({refs: Test.refs}))
  assert.equal(res!, a)

  const b = {id: 'b', title: 'Entry B'}
  const c = {id: 'c', title: 'Entry C'}
  const Entry = collection({
    name: 'Entry',
    columns: {
      id: column.string(),
      title: column.string()
    }
  })
  query(insertInto(Entry).values(b, c))

  /*const refs = Test.refs.each()
  const Link = Entry.as('Link')
  const tests = Test.select({
    links: refs
      .where(refs.get('type').is('entry'))
      .innerJoin(Link, Link.id.is(refs.get('id')))
      .select({id: Link.id, title: Link.title})
  })
  const res2 = db.first(query)!
  assert.equal(res2.links, [
    {id: 'b', title: 'Entry B'},
    {id: 'c', title: 'Entry C'}
  ])*/
})

test.run()
