import {suite} from '@alinea/suite'
import {isBun, isDeno} from '../../TestRuntime.ts'
import type {Target, Type} from './Push.ts'

const test = suite(import.meta)

if (!isDeno) {
  const {gs, fuzzPush, close} = await import('./Push.ts')
  const sqlite = await import('#/sqlite.ts')
  const universal = await import('#/universal.ts')
  const drivers = await import('#/driver.ts')
  const {push} = await import('#/sqlite/push.ts')
  const {generate} = await import('#/sqlite/generate.ts')
  const {inspect} = await import('#/sqlite/inspect.ts')

  const pick = <T>(...values: Array<T>) => gs.sampledFrom(values)
  const types: Array<Type> = [
    {
      name: 'integer',
      column: () => sqlite.integer(),
      values: pick(0, 1, 2),
      fallback: 1,
      key: true
    },
    {
      name: 'text',
      column: () => sqlite.text(),
      values: pick('a', 'b', ''),
      fallback: 'd',
      key: true
    },
    {
      name: 'real',
      column: () => sqlite.real(),
      values: pick(0.5, 1, -2),
      fallback: 1.5,
      key: true
    },
    {
      name: 'numeric',
      column: () => sqlite.numeric(),
      values: pick(1, 2.5),
      fallback: 2,
      key: true
    },
    {
      name: 'blob',
      column: () => sqlite.blob(),
      values: pick(new Uint8Array([1]), new Uint8Array([2, 3])),
      fallback: new Uint8Array([4]),
      key: true
    },
    {
      name: 'varchar',
      column: () => universal.varchar(undefined, {length: 5}),
      values: pick('a', 'bb'),
      fallback: 'v',
      key: true
    },
    {
      name: 'boolean',
      column: () => universal.boolean(),
      values: gs.booleans(),
      fallback: true,
      key: true
    },
    {
      name: 'json',
      column: () => universal.json(),
      values: pick<unknown>({a: 1}, [1], 'x'),
      fallback: {b: 2},
      key: true
    }
  ]

  const base = {
    push,
    generate,
    types,
    atomic: true,
    read: async (db: any) => inspect(db),
    clean: (tables: Array<string>) => [
      ...tables.toReversed().map(name => `drop table if exists "${name}"`),
      'drop table if exists rado_migrations'
    ]
  }
  const targets: Array<Target> = []
  if (isBun) {
    const {Database} = await import('bun:sqlite')
    targets.push({
      ...base,
      label: 'bun:sqlite',
      db: drivers['bun:sqlite'](new Database(':memory:'))
    })
  } else {
    const nodeSqlite = 'node:sqlite'
    const {DatabaseSync} = await import(nodeSqlite)
    targets.push({
      ...base,
      label: 'node:sqlite',
      db: drivers['node:sqlite'](new DatabaseSync(':memory:'))
    })
  }
  const {default: init} = await import('sql.js')
  const {Database} = await init()
  targets.push({
    ...base,
    label: 'sql.js',
    db: drivers['sql.js'](new Database())
  })

  for (const target of targets) {
    fuzzPush(test, target)
    close(test, target)
  }
}
