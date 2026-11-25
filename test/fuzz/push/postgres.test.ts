import {suite} from '@alinea/suite'
import {isDeno, testServers} from '../../TestRuntime.ts'
import type {Target, Type} from './Push.ts'

const test = suite(import.meta)

if (!isDeno) {
  const {gs, fuzzPush, close, prefix} = await import('./Push.ts')
  const pg = await import('#/postgres.ts')
  const drivers = await import('#/driver.ts')
  const {push} = await import('#/postgres/push.ts')
  const {generate} = await import('#/postgres/generate.ts')
  const {inspect} = await import('#/postgres/inspect.ts')
  const {PGlite} = await import('@electric-sql/pglite')

  const schema = `${prefix}_s`
  const mood = pg.pgEnum(`${prefix}_mood`, ['a', 'b'])
  const pick = <T>(...values: Array<T>) => gs.sampledFrom(values)
  const types: Array<Type> = [
    {
      name: 'integer',
      widens: ['bigint'],
      column: () => pg.integer(),
      values: pick(0, 1, 2),
      fallback: 1,
      key: true
    },
    {
      name: 'bigint',
      column: () => pg.bigint(),
      values: pick(0n, 1n, 2n),
      fallback: 2n,
      key: true
    },
    {
      name: 'smallint',
      widens: ['integer', 'bigint'],
      column: () => pg.smallint(),
      values: pick(0, 1),
      fallback: 1,
      key: true
    },
    {
      name: 'text',
      column: () => pg.text(),
      values: pick('a', 'b', ''),
      fallback: 'd',
      key: true
    },
    {
      name: 'varchar',
      widens: ['text'],
      column: () => pg.varchar({length: 5}),
      values: pick('a', 'bb'),
      fallback: 'v',
      key: true
    },
    {
      name: 'boolean',
      column: () => pg.boolean(),
      values: gs.booleans(),
      fallback: true,
      key: true
    },
    {
      name: 'double',
      column: () => pg.doublePrecision(),
      values: pick(0.5, 1, -2),
      fallback: 1.5,
      key: true
    },
    {
      name: 'numeric',
      column: () => pg.numeric(),
      values: pick('1', '2.5'),
      fallback: '3',
      key: true
    },
    {
      name: 'date',
      column: () => pg.date(),
      values: pick('2024-01-02', '1999-12-31'),
      fallback: '2000-01-01',
      key: true
    },
    {
      name: 'timestamp',
      column: () => pg.timestamp(),
      values: pick(new Date('2024-01-02T03:04:05Z'), new Date(0)),
      fallback: new Date('2000-01-01T00:00:00Z'),
      key: true
    },
    {
      name: 'jsonb',
      column: () => pg.jsonb(),
      values: pick<unknown>({a: 1}, [1], 'x'),
      fallback: {b: 2},
      key: true
    },
    {
      name: 'json',
      column: () => pg.json(),
      values: pick<unknown>({a: 1}, [1]),
      fallback: {b: 2}
    },
    {
      name: 'enum',
      column: () => mood(),
      values: pick('a', 'b'),
      fallback: 'b',
      key: true
    }
  ]

  const base = {
    push,
    generate,
    types,
    schema,
    atomic: true,
    read: async (db: any) => {
      const own = await inspect(db)
      const other = await inspect(db, {schema})
      return {
        tables: [...own.tables, ...other.tables],
        views: [...own.views, ...other.views]
      }
    },
    clean: (tables: Array<string>) => [
      `drop schema if exists "${schema}" cascade`,
      ...tables.map(name => `drop table if exists "${name}" cascade`),
      `drop type if exists "${prefix}_mood" cascade`,
      'drop table if exists rado_migrations'
    ]
  }
  const shadow = () => drivers['@electric-sql/pglite'](new PGlite())
  const targets: Array<Target> = [
    {
      ...base,
      label: 'pglite',
      db: drivers['@electric-sql/pglite'](new PGlite()),
      shadow: shadow()
    }
  ]

  if (testServers) {
    const url = 'postgres://postgres:postgres@localhost:5432/postgres'
    const {default: Pg} = await import('pg')
    const client = new Pg.Client({connectionString: url})
    await client.connect()
    targets.push({
      ...base,
      label: 'pg',
      db: drivers.pg(client),
      shadow: shadow()
    })
  }

  for (const target of targets) {
    fuzzPush(test, target)
    close(test, target)
  }
}
