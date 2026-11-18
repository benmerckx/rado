import type {DefineTest} from '@alinea/suite'
import {type Database, sql, table} from '#/index.ts'
import {inspect} from '#/inspect.ts'
import {inspect as sqliteInspect} from '#/sqlite/inspect.ts'
import {push as sqlitePush} from '#/sqlite/push.ts'
import {integer} from '#/universal.ts'
import {failure, fixture} from '../TestUtils.ts'

const setup = {
  sqlite: [
    'create table insp_owner (tenant integer, id integer, email text, constraint insp_owner_email unique (email), primary key (tenant, id))',
    `create table insp_item (id integer primary key autoincrement, label text not null default 'new', score real default 0, owner_tenant integer, owner_id integer, foreign key (owner_tenant, owner_id) references insp_owner (tenant, id) on delete cascade on update restrict)`,
    'create index insp_item_lower on insp_item (lower(label))',
    'create index insp_item_partial on insp_item (score) where score > 0',
    'create view insp_view as select id, label from insp_item'
  ],
  postgres: [
    'create schema if not exists insp_other',
    'create table insp_other.insp_ref (id int primary key)',
    'create table insp_owner (tenant int, id int, email text, constraint insp_owner_email unique (email), primary key (tenant, id))',
    `create table insp_item (id int generated always as identity primary key, label text not null default 'new', score real default 0, owner_tenant int, owner_id int, ref int references insp_other.insp_ref (id), foreign key (owner_tenant, owner_id) references insp_owner (tenant, id) on delete cascade on update restrict)`,
    'create index insp_item_lower on insp_item (lower(label))',
    'create index insp_item_partial on insp_item (score) where score > 0',
    'create view insp_view as select id, label from insp_item'
  ],
  mysql: [
    'create table insp_owner (tenant int, id int, email varchar(100), constraint insp_owner_email unique (email), primary key (tenant, id))',
    `create table insp_item (id int auto_increment primary key, label varchar(50) not null default 'new', score double default 0, owner_tenant int, owner_id int, foreign key (owner_tenant, owner_id) references insp_owner (tenant, id) on delete cascade on update restrict)`,
    'create index insp_item_lower on insp_item ((lower(label)))',
    'create view insp_view as select id, label from insp_item'
  ]
}

const teardown = [
  'drop view if exists insp_view',
  'drop table if exists insp_item',
  'drop table if exists insp_owner'
]

export function testInspect(db: Database, test: DefineTest) {
  const runtime = db.dialect.runtime
  const run = async (statements: Array<string>) => {
    for (const statement of statements) await db.run(sql.unsafe(statement))
  }
  const cleanup = (statements: Array<string>) => () => run(statements)
  const reset = async () => {
    await run(teardown)
    if (runtime === 'postgres')
      await run(['drop schema if exists insp_other cascade'])
  }

  test('inspect tables, keys and views', async () => {
    await fixture(reset, async () => {
      await run(setup[runtime])
      const schema = await inspect(db)
      const table = (name: string) =>
        schema.tables.find(table => table.name === name)!
      const owner = table('insp_owner')
      const item = table('insp_item')
      test.equal(owner.primaryKey?.columns, ['tenant', 'id'])
      const unique =
        runtime === 'mysql'
          ? owner.indexes.find(index => index.unique)!
          : owner.uniques[0]
      test.equal(unique.columns, ['email'])
      test.equal(
        unique.name,
        runtime === 'sqlite' ? undefined : 'insp_owner_email'
      )
      const column = (name: string) =>
        item.columns.find(column => column.name === name)!
      test.equal(column('id').autoIncrement, true)
      test.equal(column('label').notNull, true)
      test.equal(column('label').default?.includes("'new'"), true)
      test.equal(column('score').default?.includes('0'), true)
      test.equal(column('score').autoIncrement, false)
      const fk = item.foreignKeys.find(fk => fk.table === 'insp_owner')!
      test.equal(fk.columns, ['owner_tenant', 'owner_id'])
      test.equal(fk.references, ['tenant', 'id'])
      test.equal([fk.onDelete, fk.onUpdate], ['CASCADE', 'RESTRICT'])
      const lower = item.indexes.find(
        index => index.name === 'insp_item_lower'
      )!
      test.equal(lower.columns.length, 1)
      test.equal(lower.columns[0].toLowerCase().includes('lower('), true)
      test.equal(/create index/i.test(lower.definition), true)
      if (runtime !== 'mysql') {
        const partial = item.indexes.find(
          index => index.name === 'insp_item_partial'
        )!
        test.equal(partial.columns, ['score'])
        test.equal(partial.where?.includes('score'), true)
      }
      const view = schema.views.find(view => view.name === 'insp_view')!
      test.equal(/^create view/i.test(view.definition), true)
      test.equal(view.definition.includes('insp_item'), true)
      if (runtime === 'postgres') {
        const ref = item.foreignKeys.find(fk => fk.table === 'insp_ref')!
        test.equal(
          [ref.schema, ref.columns, ref.references],
          ['insp_other', ['ref'], ['id']]
        )
        const other = await inspect(db, {schema: 'insp_other'})
        test.equal(
          other.tables.map(table => table.name),
          ['insp_ref']
        )
      }
    })
  })

  test('inspect reads odd identifiers', async () => {
    const statements = {
      sqlite: [
        'create table "insp(odd, t" ("a b" int, "c)d" int, primary key ("a b", "c)d"))',
        'create index "insp(i" on "insp(odd, t" ("a b" desc, lower("c)d") desc) where "a b" > 0'
      ],
      postgres: [
        'create table "insp(odd, t" ("a, b" int, "c)d" int, "userId" int, primary key ("a, b", "c)d"))',
        'create index "insp(i" on "insp(odd, t" ("userId", lower("c)d"::text))'
      ],
      mysql: [
        'create table `insp(odd, t` (`a, b` int, `c)d` int, body text, primary key (`a, b`, `c)d`), fulltext index `insp(i` (body))'
      ]
    }
    const drop = [
      'drop table if exists "insp(odd, t"'.replaceAll(
        '"',
        runtime === 'mysql' ? '`' : '"'
      )
    ]
    await fixture(cleanup(drop), async () => {
      await run(statements[runtime])
      const {tables} = await inspect(db)
      const odd = tables.find(table => table.name === 'insp(odd, t')!
      const index = odd.indexes.find(index => index.name === 'insp(i')!
      if (runtime === 'sqlite') {
        test.equal(odd.primaryKey?.columns, ['a b', 'c)d'])
        test.equal(index.columns, ['a b', 'lower("c)d")'])
        test.equal(index.where, '"a b" > 0')
      } else if (runtime === 'postgres') {
        test.equal(odd.primaryKey?.columns, ['a, b', 'c)d'])
        test.equal(index.columns, ['userId', 'lower("c)d"::text)'])
      } else {
        test.equal(odd.primaryKey?.columns, ['a, b', 'c)d'])
        test.equal(index.definition.startsWith('create fulltext index'), true)
      }
    })
  })

  test('inspect reads indexes of a shadowed name', async () => {
    if (runtime !== 'sqlite') return
    await run([
      'create table insp_shadow (a int, b int)',
      'create index insp_shadow_ix on insp_shadow (a)',
      'create temp table insp_temp (a int, b int)',
      'create index temp.insp_shadow_ix on insp_temp (b)'
    ])
    try {
      const {tables} = await inspect(db)
      const table = tables.find(table => table.name === 'insp_shadow')!
      test.equal(table.indexes[0].columns, ['a'])
    } finally {
      await run(['drop table temp.insp_temp', 'drop table insp_shadow'])
    }
  })

  test('inspect reads generated columns', async () => {
    const drop = ['drop table if exists insp_gen']
    await fixture(cleanup(drop), async () => {
      await run([
        `create table insp_gen (a ${runtime === 'sqlite' ? 'integer' : 'int'}, b int generated always as (a * 2) stored)`
      ])
      const {tables} = await inspect(db)
      const [a, b] = tables.find(table => table.name === 'insp_gen')!.columns
      test.equal([a.name, a.generated], ['a', undefined])
      test.equal(b.name, 'b')
      test.equal(b.default, null)
      test.equal(/a\W*\*\W*2/.test(b.generated ?? ''), true)
      // Push still leaves generated columns out on sqlite
      if (runtime === 'sqlite' && db.driver.supportsTransactions)
        test.equal(
          await sqlitePush.plan(db as any, table('insp_gen', {a: integer()})),
          []
        )
    })
  })

  test('inspect unescapes mysql expressions', async () => {
    if (runtime !== 'mysql') return
    const drop = ['drop table if exists insp_expr']
    await fixture(cleanup(drop), async () => {
      await run([
        `create table insp_expr (a text default (''), b varchar(9) as (concat(a, 'x')), index insp_expr_ix ((concat(b, 'y'))))`
      ])
      const {tables} = await inspect(db)
      const {columns, indexes} = tables.find(
        table => table.name === 'insp_expr'
      )!
      test.equal(columns[0].default, "_utf8mb4''")
      test.equal(columns[1].generated, "concat(`a`,_utf8mb4'x')")
      await run(['drop index insp_expr_ix on insp_expr', indexes[0].definition])
    })
  })

  test('inspect refuses another dialect', async () => {
    if (runtime === 'sqlite') return
    const error = await failure(() => sqliteInspect(db as any))
    test.equal(error, 'Expected a sqlite database')
  })
}
