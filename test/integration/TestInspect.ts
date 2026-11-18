import type {DefineTest} from '@alinea/suite'
import {type Database, sql} from '#/index.ts'
import {inspect} from '#/inspect.ts'
import {inspect as sqliteInspect} from '#/sqlite/inspect.ts'

const fixture = {
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

const cleanup = [
  'drop view if exists insp_view',
  'drop table if exists insp_item',
  'drop table if exists insp_owner'
]

export function testInspect(db: Database, test: DefineTest) {
  const runtime = db.dialect.runtime
  const run = async (statements: Array<string>) => {
    for (const statement of statements) await db.run(sql.unsafe(statement))
  }
  const reset = async () => {
    await run(cleanup)
    if (runtime === 'postgres')
      await run(['drop schema if exists insp_other cascade'])
  }

  test('inspect reads tables, keys, indexes and views', async () => {
    await reset()
    await run(fixture[runtime])
    try {
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
      if (runtime !== 'sqlite') test.equal(unique.name, 'insp_owner_email')
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
    } finally {
      await reset()
    }
  })

  test('inspect refuses another dialect', async () => {
    if (runtime === 'sqlite') return
    const error = await Promise.resolve()
      .then(() => sqliteInspect(db as any))
      .then(
        () => '',
        error => error.message
      )
    test.equal(error, 'Expected a sqlite database')
  })
}
