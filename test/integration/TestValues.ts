import type {DefineTest} from '@alinea/suite'
import {type Database, asc, eq, table} from '#/index.ts'
import * as column from '#/universal/columns.ts'

const Values = table('Values', {
  id: column.id(),
  text: column.text(),
  int: column.integer(),
  number: column.number(),
  bool: column.boolean(),
  json: column.json<unknown>(),
  jsonb: column.jsonb<unknown>(),
  blob: column.blob()
})

export function testValues(db: Database, test: DefineTest) {
  async function roundTrip<T>(field: keyof typeof Values, values: Array<T>) {
    await db.create(Values)
    try {
      await db.insert(Values).values(values.map(value => ({[field]: value})))
      return await db
        .select(Values[field] as any)
        .from(Values)
        .orderBy(asc(Values.id))
    } finally {
      await db.drop(Values)
    }
  }

  test('text values', async () => {
    const values = ['', "it's", 'a\\b\nc', 'ünïcødé ✓ 🎉', null]
    test.equal(await roundTrip('text', values), values)
  })

  test('integer values', async () => {
    const values = [0, -1, 2147483647, -2147483648, null]
    test.equal(await roundTrip('int', values), values)
  })

  test('number values', async () => {
    const values = [0, -0.5, 0.1, 123456.789, -1e10, null]
    test.equal(await roundTrip('number', values), values)
  })

  test('boolean values', async () => {
    const values = [true, false, null]
    test.equal(await roundTrip('bool', values), values)
  })

  test('json values', async () => {
    const values = [
      {nested: {quote: `"'`, unicode: '✓'}},
      [1, 'two', {three: 3}],
      'string',
      42,
      false,
      {}
    ]
    test.equal(await roundTrip('json', values), values)
    test.equal(await roundTrip('jsonb', values), values)
  })

  test('null json', async () => {
    test.equal(await roundTrip('json', [null]), [null])
    test.equal(await roundTrip('jsonb', [null]), [null])
  })

  test('blob values', async () => {
    const all = Uint8Array.from({length: 256}, (_, i) => i)
    const rows = await roundTrip('blob', [new Uint8Array(), all, null])
    test.equal(
      rows.map(row => (row ? Array.from(row as Uint8Array) : row)),
      [[], Array.from(all), null]
    )
  })

  test('jsonb paths', async () => {
    await db.create(Values)
    try {
      await db
        .insert(Values)
        .values([{jsonb: {a: {b: 'x'}, list: [1, 2]}}, {jsonb: {a: {b: 'y'}}}])
      const Jsonb = Values.jsonb as any
      const rows = await db
        .select({b: Jsonb.a.b, first: Jsonb.list[0]})
        .from(Values)
        .where(eq(Jsonb.a.b, 'x'))
      test.equal(rows, [{b: 'x', first: 1}])
    } finally {
      await db.drop(Values)
    }
  })
}
