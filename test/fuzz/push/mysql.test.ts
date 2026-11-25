import {suite} from '@alinea/suite'
import {isDeno, testServers} from '../../TestRuntime.ts'
import type {Target, Type} from './Push.ts'

const test = suite(import.meta)

if (!isDeno) {
  const {gs, fuzzPush, close} = await import('./Push.ts')
  const mysql = await import('#/mysql.ts')
  const drivers = await import('#/driver.ts')
  const {push} = await import('#/mysql/push.ts')
  const {generate} = await import('#/mysql/generate.ts')
  const {inspect} = await import('#/mysql/inspect.ts')
  const {MySQL} = await import('mysql-wasm')
  const {sql} = await import('#/index.ts')

  const pick = <T>(...values: Array<T>) => gs.sampledFrom(values)
  const types: Array<Type> = [
    {
      name: 'int',
      column: () => mysql.integer(),
      values: pick(0, 1, 2),
      fallback: 1,
      key: true
    },
    {
      name: 'bigint',
      column: () => mysql.bigint(),
      values: pick(0n, 1n, 2n),
      fallback: 2n,
      key: true
    },
    {
      name: 'varchar',
      column: () => mysql.varchar({length: 5}),
      values: pick('a', 'bb'),
      fallback: 'v',
      key: true
    },
    {
      name: 'text',
      column: () => mysql.text(),
      values: pick('a', 'b', '')
    },
    {
      name: 'boolean',
      column: () => mysql.boolean(),
      values: gs.booleans(),
      fallback: true,
      key: true
    },
    {
      name: 'double',
      column: () => mysql.double(),
      values: pick(0.5, 1, -2),
      fallback: 1.5,
      key: true
    },
    {
      name: 'decimal',
      column: () => mysql.decimal({precision: 6, scale: 2}),
      values: pick('1.00', '2.50'),
      fallback: '3.00',
      key: true
    },
    {
      name: 'datetime',
      column: () => mysql.datetime(),
      values: pick(new Date('2024-01-02T03:04:05Z'), new Date(0)),
      fallback: new Date('2000-01-01T00:00:00Z'),
      key: true
    },
    {
      name: 'json',
      column: () => mysql.json(),
      values: pick<unknown>({a: 1}, [1])
    },
    {
      name: 'enum',
      column: () => mysql.mysqlEnum(undefined!, ['a', 'b']),
      values: pick('a', 'b'),
      fallback: 'b',
      key: true
    }
  ]

  const base = {
    push,
    generate,
    types,
    read: async (db: any) => inspect(db),
    clean: (tables: Array<string>) => [
      ...tables.toReversed().map(name => `drop table if exists \`${name}\``),
      'drop table if exists rado_migrations'
    ]
  }
  const shadow = async () => drivers['mysql-wasm'](await MySQL.create())
  const targets: Array<Target> = [
    {
      ...base,
      label: 'mysql-wasm',
      db: drivers['mysql-wasm'](await MySQL.create()),
      shadow: await shadow()
    }
  ]

  if (testServers) {
    const url = 'mysql://root:mysql@localhost:3306/mysql'
    const {default: mysql2} = await import('mysql2')
    const connection = mysql2.createConnection({
      uri: url,
      multipleStatements: true
    })
    targets.push({
      ...base,
      label: 'mysql2',
      db: drivers.mysql2(connection),
      shadow: await shadow()
    })
  }

  // Datetimes are written and read as UTC
  for (const {db} of targets) await db.run(sql`set time_zone = '+00:00'`)

  for (const target of targets) {
    fuzzPush(test, target)
    close(test, target)
  }
}
