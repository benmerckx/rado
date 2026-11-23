import {suite} from '@alinea/suite'
import {isBun, isDeno} from '../TestRuntime.ts'
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
    numbers,
    universalCases
  } = await import('./Fuzz.ts')
  const sqlite = await import('#/sqlite.ts')
  const drivers = await import('#/driver.ts')

  function cases(options: Limits = {}) {
    const doc = json(options)
    return {
      ...universalCases(options),
      int: field(sqlite.integer(), ints(-(2 ** 53) + 1, 2 ** 53 - 1), {
        expect: n => n + 0
      }),
      bool: field(sqlite.integer({mode: 'boolean'}), gs.booleans()),
      timestamp: field(
        sqlite.integer({mode: 'timestamp'}),
        dates('-271821-04-20', '+275760-09-13'),
        {expect: date => new Date(Math.floor(date.getTime() / 1000) * 1000)}
      ),
      timestampMs: field(
        sqlite.integer({mode: 'timestamp_ms'}),
        dates('-271821-04-20', '+275760-09-13')
      ),
      // SQLite stores integral reals as integers, which turns -0 into 0
      real: field(sqlite.real(), doubles(), {expect: n => n + 0}),
      numeric: field(sqlite.numeric(), numbers(options), {
        expect: n => n + 0
      }),
      textLength: field(sqlite.text({length: 3}), strings(options)),
      textEnum: field(
        sqlite.text({enum: ['a', 'b', 'ü']}),
        gs.sampledFrom(['a', 'b', 'ü'] as const)
      ),
      textJson: field(sqlite.text({mode: 'json'}), doc, {
        expect: asJson
      }),
      blobBytes: field(sqlite.blob(), bytes()),
      blobBuffer: field(
        sqlite.blob({mode: 'buffer'}),
        bytes().map(bytes => bytes.slice().buffer)
      ),
      blobBigint: field(
        sqlite.blob({mode: 'bigint'}),
        gs.oneOf(bigints(-(2n ** 63n), 2n ** 63n - 1n), gs.bigIntegers())
      ),
      blobJson: field(sqlite.blob({mode: 'json'}), doc, {
        expect: asJson
      }),
      sqliteJson: field(sqlite.json(), doc, {expect: asJson}),
      sqliteJsonb: field(sqlite.jsonb(), doc, {expect: asJson})
    }
  }

  const targets: Array<Target> = []
  if (isBun) {
    const {Database} = await import('bun:sqlite')
    targets.push({
      label: 'bun:sqlite',
      db: drivers['bun:sqlite'](new Database(':memory:'))
    })
  } else {
    const nodeSqlite = 'node:sqlite'
    const {DatabaseSync} = await import(nodeSqlite)
    targets.push({
      label: 'node:sqlite',
      db: drivers['node:sqlite'](new DatabaseSync(':memory:')),
      limits: {unsafe: false}
    })
  }
  const {default: init} = await import('sql.js')
  const {Database} = await init()
  targets.push({
    label: 'sql.js',
    db: drivers['sql.js'](new Database()),
    // sql.js binds strings as C strings, cutting them off at the first NUL,
    // and decodes them with a TextDecoder, which drops a leading BOM. Json
    // columns have numeric affinity, so a top level number is stored as a
    // real, which the SQLite it bundles (3.49) doesn't always parse exactly.
    limits: {nul: false, bom: false, jsonNumbers: false}
  })

  for (const target of targets) {
    fuzz(test, target, cases(target.limits))
    close(test, target)
  }
}
