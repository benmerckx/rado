import {suite} from '@alinea/suite'
import {isBun, isDeno, testServers} from '../TestRuntime.ts'
import type {Target} from './Fuzz.ts'

const test = suite(import.meta)

if (!isDeno) {
  const {gs, field, fuzz, close, ints, bigints, doubles, strings, bytes, json} =
    await import('./Fuzz.ts')
  const {dates, days, signless, universalCases} = await import('./Fuzz.ts')
  const mysql = await import('#/mysql.ts')
  const drivers = await import('#/driver.ts')

  const asJson = (value: unknown) => JSON.parse(JSON.stringify(value))
  const decimals = gs.fromRegex('-?(0|[1-9][0-9]{0,19})(\\.[0-9]{1,10})?', {
    fullmatch: true
  })
  const times = gs.fromRegex('([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]', {
    fullmatch: true
  })
  const values = ['a', "it's", 'ü 😀', 'b c'] as const

  function canonical(value: string, scale: number) {
    const [whole, fraction = ''] = value.replace(/^-(?=[0.]+$)/, '').split('.')
    return scale ? `${whole}.${fraction.padEnd(scale, '0')}` : whole!
  }

  // MySQL prints floats with 6 significant digits
  function sixDigits(actual: unknown, expected: unknown) {
    if (typeof actual !== 'number' || typeof expected !== 'number') return false
    if (expected === 0) return actual === 0
    const unit = 10 ** (Math.floor(Math.log10(Math.abs(expected))) - 5)
    return Math.abs(actual - expected) <= unit / 2
  }

  // MySQL rounds fractional seconds that don't fit the column
  function seconds(date: Date) {
    return new Date(Math.round(date.getTime() / 1000) * 1000)
  }

  function cases() {
    return {
      ...universalCases(),
      tinyint: field(mysql.tinyint(), ints(-128, 127), {expect: n => n + 0}),
      tinyintUnsigned: field(mysql.tinyint({unsigned: true}), ints(0, 255), {
        expect: n => n + 0
      }),
      smallint: field(mysql.smallint(), ints(-32768, 32767), {
        expect: n => n + 0
      }),
      smallintUnsigned: field(
        mysql.smallint({unsigned: true}),
        ints(0, 65535),
        {expect: n => n + 0}
      ),
      mediumint: field(mysql.mediumint(), ints(-8388608, 8388607), {
        expect: n => n + 0
      }),
      mediumintUnsigned: field(
        mysql.mediumint({unsigned: true}),
        ints(0, 16777215),
        {expect: n => n + 0}
      ),
      int: field(mysql.int(), ints(-2147483648, 2147483647), {
        expect: n => n + 0
      }),
      bigintNumber: field(
        mysql.bigint({mode: 'number'}),
        ints(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
        {expect: n => n + 0}
      ),
      bigint: field(mysql.bigint(), bigints(-(2n ** 63n), 2n ** 63n - 1n)),
      bigintUnsigned: field(
        mysql.bigint({unsigned: true}),
        bigints(0n, 2n ** 64n - 1n)
      ),
      float: field(
        mysql.float(),
        gs.floats({width: 32, allowNan: false, allowInfinity: false}),
        {same: sixDigits}
      ),
      double: field(mysql.double(), doubles(), {same: signless}),
      real: field(mysql.real(), doubles(), {same: signless}),
      decimal: field(mysql.decimal({precision: 30, scale: 10}), decimals, {
        expect: value => canonical(value, 10)
      }),
      decimalNumber: field(
        mysql.decimal({mode: 'number', precision: 30, scale: 10}),
        decimals.map(Number),
        {expect: n => Number(canonical(String(n), 10))}
      ),
      decimalBigint: field(
        mysql.decimal({mode: 'bigint', precision: 30, scale: 0}),
        bigints(-(10n ** 30n) + 1n, 10n ** 30n - 1n)
      ),
      // MySQL drops trailing spaces from char values when reading them
      char: field(mysql.char({length: 5}), strings({maxSize: 5}), {
        expect: value => value.replace(/ +$/, '')
      }),
      varchar: field(mysql.varchar({length: 5}), strings({maxSize: 5})),
      text: field(mysql.text(), strings()),
      tinytext: field(mysql.tinytext(), strings({maxSize: 60})),
      mediumtext: field(mysql.mediumtext(), strings()),
      longtext: field(mysql.longtext(), strings()),
      boolean: field(mysql.boolean(), gs.booleans()),
      // Binary values are padded with zero bytes up to their length
      binary: field(mysql.binary({length: 16}), gs.binary({maxSize: 16}), {
        expect: value => {
          const padded = new Uint8Array(16)
          padded.set(value)
          return padded
        }
      }),
      varbinary: field(mysql.varbinary({length: 256}), bytes(256)),
      blob: field(mysql.blob(), bytes()),
      date: field(mysql.date(), days('1000', '9999-12-31')),
      dateString: field(
        mysql.date({mode: 'string'}),
        days('1000', '9999-12-31').map(date => date.toISOString().slice(0, 10))
      ),
      datetime: field(mysql.datetime(), dates('1000', '9999-12-31'), {
        expect: seconds
      }),
      datetimeFsp: field(mysql.datetime({fsp: 3}), dates('1000', '9999-12-31')),
      datetimeString: field(
        mysql.datetime({mode: 'string'}),
        dates('1000', '9999-12-31').map(date =>
          date.toISOString().replace('T', ' ').slice(0, 19)
        )
      ),
      timestamp: field(
        mysql.timestamp(),
        dates('1970-01-01T00:00:01Z', '2038-01-19T03:14:07Z'),
        {expect: seconds}
      ),
      timestampFsp: field(
        mysql.timestamp({fsp: 3}),
        dates('1970-01-01T00:00:01Z', '2038-01-19T03:14:07.999Z')
      ),
      time: field(mysql.time(), times),
      year: field(mysql.year(), gs.integers({minValue: 1901, maxValue: 2155})),
      json: field(mysql.json(), json(), {expect: asJson}),
      enum: field(mysql.mysqlEnum('enum', values), gs.sampledFrom(values))
    }
  }

  const targets: Array<Target> = []
  const {MySQL} = await import('mysql-wasm')
  targets.push({
    label: 'mysql-wasm',
    db: drivers['mysql-wasm'](await MySQL.create())
  })

  if (testServers) {
    const url = 'mysql://root:mysql@localhost:3306/mysql'
    const {default: mysql2} = await import('mysql2')
    targets.push({
      label: 'mysql2',
      db: drivers.mysql2(mysql2.createConnection(url))
    })
    if (isBun) {
      const {SQL} = await import('bun')
      // A fresh server only accepts caching_sha2_password logins over TLS
      const db = drivers['bun-sql'](new SQL({url, tls: true}))
      targets.push({label: 'bun-sql mysql', db})
    }
  }

  for (const target of targets) {
    fuzz(test, target, cases())
    close(test, target)
  }
}
