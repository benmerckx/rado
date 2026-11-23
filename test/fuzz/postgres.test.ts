import {suite} from '@alinea/suite'
import {isBun, isDeno, testServers} from '../TestRuntime.ts'
import type {Limits, Target} from './Fuzz.ts'

const test = suite(import.meta)

if (!isDeno) {
  const {
    gs,
    asJson,
    field,
    fuzz,
    close,
    ints,
    bigints,
    doubles,
    strings,
    bytes,
    json,
    dates,
    days,
    float32,
    signless,
    universalCases
  } = await import('./Fuzz.ts')
  const pg = await import('#/postgres.ts')
  const drivers = await import('#/driver.ts')

  const chars = (value: string) => [...value].length
  const decimals = gs.fromRegex('-?(0|[1-9][0-9]{0,30})(\\.[0-9]{1,20})?', {
    fullmatch: true
  })
  const cents = gs.fromRegex('-?(0|[1-9][0-9]{0,7})(\\.[0-9]{1,2})?', {
    fullmatch: true
  })
  const times = gs.fromRegex(
    '([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\\.[0-9]{1,6})?',
    {fullmatch: true}
  )
  const suffix = Math.random().toString(36).slice(2, 8)
  const mood = pg.pgEnum(`fuzz_mood_${suffix}`, ['a', "it's", 'ü 😀', 'b c'])

  // Postgres goes back to 4713 BC and further ahead than a Date can
  const first = '-004712-01-01T00:00:00Z'
  const last = '+275760-09-13T00:00:00Z'

  // How postgres prints dates: four digit years at least, 1 BC for year 0
  function pgDay(date: Date) {
    const year = date.getUTCFullYear()
    const digits = String(year > 0 ? year : 1 - year).padStart(4, '0')
    const era = year > 0 ? '' : ' BC'
    return `${digits}${date.toISOString().slice(-20, -14)}${era}`
  }

  function pgTimestamp(date: Date) {
    const [day, era = ''] = pgDay(date).split(/(?= BC)/)
    const time = trimFraction(date.toISOString().slice(-13, -1))
    return `${day} ${time}${era}`
  }

  function trimFraction(value: string) {
    return value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  }

  function canonical(value: string) {
    const unsigned = value.replace(/^-/, '')
    return /^[0.]+$/.test(unsigned) ? unsigned : value
  }

  function cases(text: Limits = {}) {
    return {
      ...universalCases(text),
      smallint: field(pg.smallint(), ints(-32768, 32767), {expect: n => n + 0}),
      int: field(pg.integer(), ints(-2147483648, 2147483647), {
        expect: n => n + 0
      }),
      bigintNumber: field(
        pg.bigint({mode: 'number'}),
        ints(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
        {expect: n => n + 0}
      ),
      bigint: field(pg.bigint(), bigints(-(2n ** 63n), 2n ** 63n - 1n)),
      double: field(pg.doublePrecision(), doubles(), {same: signless}),
      real: field(
        pg.real(),
        gs.floats({width: 32, allowNan: false, allowInfinity: false}),
        {same: float32}
      ),
      numeric: field(pg.numeric(), decimals, {expect: canonical}),
      numericNumber: field(pg.numeric({mode: 'number'}), doubles(), {
        expect: n => n + 0
      }),
      numericBigint: field(
        pg.numeric({mode: 'bigint'}),
        gs.oneOf(bigints(-(2n ** 63n), 2n ** 63n - 1n), gs.bigIntegers())
      ),
      numericScale: field(pg.numeric({precision: 10, scale: 2}), cents, {
        expect: value => {
          const [whole, fraction = ''] = canonical(value).split('.')
          return `${whole}.${fraction.padEnd(2, '0')}`
        }
      }),
      pgText: field(pg.text(), strings(text)),
      pgVarchar: field(pg.varchar({length: 5}), strings({...text, maxSize: 5})),
      char: field(
        pg.char(undefined, {length: 5}),
        strings({...text, maxSize: 5}),
        {
          expect: value => value + ' '.repeat(5 - chars(value))
        }
      ),
      uuid: field(pg.uuid(), gs.uuids()),
      pgBoolean: field(pg.boolean(), gs.booleans()),
      bytea: field(pg.bytea(), bytes()),
      pgJson: field(pg.json(), json(text), {expect: asJson}),
      pgJsonb: field(pg.jsonb(), json(text), {expect: asJson}),
      date: field(pg.date({mode: 'date'}), days(first, last)),
      dateString: field(pg.date(), days(first, last).map(pgDay)),
      timestamp: field(pg.timestamp(), dates(first, last)),
      timestamptz: field(
        pg.timestamp({withTimeZone: true}),
        dates(first, last)
      ),
      timestamptzPrecision: field(
        pg.timestamp({withTimeZone: true, precision: 3}),
        dates(first, last)
      ),
      timestampString: field(
        pg.timestamp({mode: 'string'}),
        dates(first, last).map(pgTimestamp)
      ),
      time: field(pg.time(), times, {expect: trimFraction}),
      enum: field(
        mood(),
        gs.sampledFrom(['a', "it's", 'ü 😀', 'b c'] as const)
      ),
      textArray: field(
        pg.text().array(),
        gs.arrays(gs.optional(strings({...text, maxSize: 6})), {maxSize: 4})
      ),
      intArray: field(
        pg.integer().array(),
        gs.arrays(gs.optional(ints(-2147483648, 2147483647)), {maxSize: 4}),
        {expect: list => list.map(n => (n === null ? n : n + 0))}
      )
    }
  }

  // Postgres text, json and jsonb can't hold NUL characters
  const targets: Array<Target> = []
  const {PGlite} = await import('@electric-sql/pglite')
  targets.push({
    label: 'pglite',
    db: drivers['@electric-sql/pglite'](new PGlite()),
    // PGlite decodes text with a TextDecoder, which drops a leading BOM
    limits: {nul: false, bom: false}
  })

  if (testServers) {
    const url = 'postgres://postgres:postgres@localhost:5432/postgres'
    const limits = {nul: false}
    const {default: Pg} = await import('pg')
    const client = new Pg.Client({connectionString: url})
    await client.connect()
    targets.push({label: 'pg', db: drivers.pg(client), limits})
    const {default: postgres} = await import('postgres')
    const sql = postgres(url, {onnotice() {}})
    targets.push({label: 'postgres', db: drivers.postgres(sql), limits})
    if (isBun) {
      const {SQL} = await import('bun')
      const db = drivers['bun-sql'](new SQL(url))
      targets.push({label: 'bun-sql postgres', db, limits})
    }
  }

  for (const target of targets) {
    fuzz(test, target, cases(target.limits))
    close(test, target)
  }
}
