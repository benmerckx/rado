import {suite} from '@alinea/suite'
import {Column, column} from '#/core/Column.ts'
import {
  type Database,
  type SyncDatabase,
  foreignKey,
  getTable,
  index,
  primaryKey,
  type Sql,
  sql,
  table,
  uniqueIndex
} from '#/index.ts'
import {integer, numeric, text} from '#/sqlite.ts'
import {inspect} from '#/sqlite/inspect.ts'
import {push} from '#/sqlite/push.ts'
import {isBun, isNode} from '../TestRuntime.ts'
import {type Case, testCases} from './TestCases.ts'

const test = suite(import.meta)

const custom = (type: string, args: Array<number> = [], name?: string) =>
  new Column<unknown>({name, type: column[type](...args)})

const users = table('users', {
  id: integer().notNull(),
  name: text(),
  age: integer()
})

const artist = table('artist', {
  artistid: integer().primaryKey(),
  artistname: text()
})

const orders = (where: string, name: string) =>
  table('orders', {id: integer(), status: text()}, t => ({
    [name]: index()
      .on(t.id)
      .where(sql`${t.status} ${sql.unsafe(where)}`)
  }))

// Ported from sqldef (MIT): cmd/sqlite3def/tests.yml and drizzle-kit
// (Apache-2.0): drizzle-kit/tests/push/sqlite.test.ts
const cases: Record<string, Case> = {
  CreateTable: {desired: [users]},
  CreateTableQuotes: {
    current: `
      create table "test_table" (id integer primary key);
      insert into test_table values (1);
    `,
    desired: [table('test_table', {id: integer().primaryKey()})],
    keep: {test_table: ['id']}
  },
  CreateTableWithAutoincrement: {
    desired: [
      table('users', {
        id: integer().primaryKey({autoIncrement: true}),
        name: text(),
        age: integer()
      })
    ]
  },
  DataTypes: {
    desired: [
      table('users', {
        c_timestamp: custom('timestamp'),
        c_integer: integer(),
        c_text: text()
      })
    ]
  },
  SingleQuotedID: {
    current: `create table 'bigdata' ('data' integer); insert into bigdata values (1)`,
    desired: [table('bigdata', {data: integer()})],
    keep: {bigdata: ['data']}
  },
  BracketQuotedIdentifier: {
    current: `
      create table [bigdata] ([Important Data] integer, [SELECT] text);
      insert into bigdata values (1, 'a');
    `,
    desired: [
      table('bigdata', {
        important: integer('Important Data'),
        select: text('SELECT')
      })
    ],
    keep: {bigdata: ['Important Data', 'SELECT']}
  },
  Index: {
    desired: [
      table('bigdata', {path: text().unique(), data: integer()}, t => ({
        index_bigdata: index().on(t.data)
      }))
    ]
  },
  TableOptionKeywordsAsColumnNames: {
    current: `
      create table t (id integer primary key, without integer);
      insert into t values (1, 2);
    `,
    desired: [
      table(
        't',
        {
          id: integer().primaryKey(),
          without: integer(),
          strict: integer().notNull().default(0),
          pragma: text()
        },
        t => ({idx_strict: index().on(t.strict)})
      )
    ],
    keep: {t: ['id', 'without']}
  },
  ForeignKeyConstraint: {
    desired: [
      artist,
      table('track', {
        trackid: integer(),
        trackname: text(),
        trackartist: integer().references(artist.artistid)
      })
    ]
  },
  IndependentConstraintDefinition: {
    desired: (() => {
      const a = table(
        'artist',
        {artistid: integer(), artistname: text()},
        t => [primaryKey(t.artistid)]
      )
      return [
        a,
        table(
          'track',
          {trackid: integer(), trackname: text(), trackartist: integer()},
          t => [foreignKey(t.trackartist).references(a.artistid)]
        )
      ]
    })()
  },
  RenameColumn: {
    current: `
      create table users (id bigint not null, username text, age integer);
      insert into users values (1, 'ada', 3);
    `,
    desired: [
      table('users', {
        id: custom('bigint').notNull(),
        userName: text('user_name'),
        age: integer()
      })
    ],
    options: {rename: {'users.username': 'user_name'}},
    keep: {users: ['id', 'username:user_name', 'age']}
  },
  RenameColumnWithTypeChange: {
    current: `
      create table users (id bigint not null, username varchar(100), age integer);
      insert into users values (1, 'ada', 3);
    `,
    desired: [
      table('users', {
        id: custom('bigint').notNull(),
        userName: text('user_name').notNull(),
        age: integer()
      })
    ],
    options: {rename: {'users.username': 'user_name'}},
    keep: {users: ['id', 'username:user_name', 'age']}
  },
  RenameIndex: {
    current: `
      create table users (id bigint not null, email varchar(255));
      create index old_email_idx on users (email);
    `,
    desired: [
      table(
        'users',
        {id: custom('bigint').notNull(), email: custom('varchar', [255])},
        t => ({new_email_idx: index().on(t.email)})
      )
    ]
  },
  RenameMultipleIndexes: {
    current: `
      create table users (id bigint not null, email varchar(255), username varchar(100));
      create index idx_email on users (email);
      create index idx_username on users (username);
    `,
    desired: [
      table(
        'users',
        {
          id: custom('bigint').notNull(),
          email: custom('varchar', [255]),
          username: custom('varchar', [100])
        },
        t => ({
          email_idx: index().on(t.email),
          username_idx: index().on(t.username)
        })
      )
    ]
  },
  RenameUniqueIndex: {
    current: `
      create table users (id bigint not null, email varchar(255));
      create unique index old_unique_email on users (email);
    `,
    desired: [
      table(
        'users',
        {id: custom('bigint').notNull(), email: custom('varchar', [255])},
        t => ({unique_email: uniqueIndex().on(t.email)})
      )
    ]
  },
  RenameIndexWithWhereClause: {
    current: `
      create table users (id bigint not null, email varchar(255), is_active boolean default 1);
      create index old_active_users on users (email) where is_active = 1;
    `,
    desired: [
      table(
        'users',
        {
          id: custom('bigint').notNull(),
          email: custom('varchar', [255]),
          isActive: custom('boolean', [], 'is_active').default(sql`1`)
        },
        t => ({
          active_users_idx: index()
            .on(t.email)
            .where(sql`is_active = 1`)
        })
      )
    ]
  },
  PartialIndexWithWhereIn: {
    desired: [orders(`in ('active', 'pending')`, 'idx_active')]
  },
  PartialIndexWithWhereNotIn: {
    desired: [orders(`not in ('cancelled', 'deleted')`, 'idx_non_cancelled')]
  },
  PartialIndexWithWhereInUnsorted: {
    current: `
      create table orders (id integer, status text);
      create index idx_active on orders (id) where status in ('active', 'pending');
    `,
    desired: [orders(`in ('pending', 'active')`, 'idx_active')]
  },
  NumericDecimalWithoutPrecision: {
    current: `
      create table test (id int, num numeric, price decimal);
      insert into test values (1, 2, 3);
    `,
    desired: [
      table('test', {
        id: custom('int'),
        num: numeric(),
        price: custom('decimal')
      })
    ],
    keep: {test: ['id', 'num', 'price']}
  },
  NumericDecimalExplicit: {
    current: `
      create table test (
        id int, num1 numeric(10), num2 numeric(15, 4),
        price1 decimal(12), price2 decimal(20, 6)
      )
    `,
    desired: [
      table('test', {
        id: custom('int'),
        num1: custom('numeric', [10]),
        num2: custom('numeric', [15, 4]),
        price1: custom('decimal', [12]),
        price2: custom('decimal', [20, 6])
      })
    ]
  },

  // drizzle-kit
  DroppedAddedUniqueIndex: {
    current: `
      create table users (id integer primary key, name text, email text);
      create unique index users_name_unique on users (name);
    `,
    desired: [
      table(
        'users',
        {id: integer().primaryKey(), name: text(), email: text()},
        t => ({users_email_unique: uniqueIndex().on(t.email)})
      )
    ]
  },
  DropAutoincrementDropColumnWithData: {
    current: `
      create table companies (
        id integer primary key autoincrement, name text
      );
      insert into companies (name) values ('drizzle'), ('turso');
    `,
    desired: [table('companies', {id: integer().primaryKey()})],
    options: {force: true},
    keep: {companies: ['id']}
  },
  ChangeAutoincrementReferencedByOtherTable: {
    current: `
      create table companies (id integer primary key autoincrement);
      create table users (
        id integer primary key autoincrement,
        name text unique,
        company_id text references companies(id)
      );
      insert into companies values (1), (2);
      insert into users (name, company_id) values ('drizzle', 1);
    `,
    desired: (() => {
      const companies = table('companies', {id: integer().primaryKey()})
      return [
        companies,
        table('users', {
          id: integer().primaryKey({autoIncrement: true}),
          name: text().unique(),
          companyId: text('company_id').references(companies.id)
        })
      ]
    })(),
    keep: {companies: ['id'], users: ['id', 'name', 'company_id']}
  },
  DropNotNullAddNotNull: {
    current: `
      create table users (id integer primary key autoincrement, name text not null);
      create table posts (id integer primary key autoincrement, name text, user_id integer);
      insert into users (name) values ('a');
      insert into posts (name, user_id) values ('b', 1);
    `,
    desired: [
      table('users', {
        id: integer().primaryKey({autoIncrement: true}),
        name: text()
      }),
      table('posts', {
        id: integer().primaryKey({autoIncrement: true}),
        name: text().notNull(),
        userId: integer('user_id')
      })
    ],
    keep: {users: ['id', 'name'], posts: ['id', 'name', 'user_id']}
  },
  RenameColumnAndChangeDataType: {
    current: `
      create table users (id integer primary key, name text);
      insert into users values (1, '12');
    `,
    desired: [table('users', {id: integer().primaryKey(), age: integer()})],
    options: {rename: {'users.name': 'age'}, force: true},
    keep: {users: ['id']}
  },
  RecreateTableWithNestedReferences: {
    current: `
      create table users (id integer primary key autoincrement, name text, age integer);
      create table subscriptions (
        id integer primary key autoincrement,
        user_id integer references users(id),
        customer_id text
      );
      create table subscriptions_metadata (
        id integer primary key autoincrement,
        subscription_id text references subscriptions(id)
      );
      insert into users (name, age) values ('a', 1);
      insert into subscriptions (user_id, customer_id) values (1, 'c');
      insert into subscriptions_metadata (subscription_id) values (1);
    `,
    desired: (() => {
      const users = table('users', {
        id: integer().primaryKey(),
        name: text(),
        age: integer()
      })
      const subscriptions = table('subscriptions', {
        id: integer().primaryKey({autoIncrement: true}),
        userId: integer('user_id').references(users.id),
        customerId: text('customer_id')
      })
      return [
        users,
        subscriptions,
        table('subscriptions_metadata', {
          id: integer().primaryKey({autoIncrement: true}),
          subscriptionId: text('subscription_id').references(subscriptions.id)
        })
      ]
    })(),
    keep: {
      users: ['id', 'name', 'age'],
      subscriptions: ['id', 'user_id', 'customer_id'],
      subscriptions_metadata: ['id', 'subscription_id']
    }
  },
  CreateCompositePrimaryKey: {
    current: `
      create table composite (col1 integer, col2 text);
      insert into composite values (1, 'a');
    `,
    desired: [
      table('composite', {col1: integer(), col2: text()}, t => [
        primaryKey(t.col1, t.col2)
      ])
    ],
    keep: {composite: ['col1', 'col2']}
  }
}

function failure(run: () => unknown): string | undefined {
  try {
    run()
  } catch (error) {
    return (error as Error).message
  }
}

function testRebuild(db: SyncDatabase<'sqlite'>) {
  const run = (query: string) => db.run(sql.unsafe(query))
  const Parent = table('parent', {
    id: integer().primaryKey(),
    code: integer()
  })
  const Child = table('child', {
    id: integer().primaryKey(),
    parent: integer().references(Parent.id, {onDelete: 'cascade'})
  })
  const Log = table('log', {message: text()})
  const reset = async () => {
    await run('drop view if exists parent_codes')
    for (const name of ['child', 'parent', 'log'])
      await run(`drop table if exists ${name}`)
  }

  test('rebuild keeps rows that reference the table', async () => {
    await reset()
    await run('create table parent (id integer primary key, code text)')
    await run(
      'create table child (id integer primary key, parent integer references parent(id) on delete cascade)'
    )
    await run(`insert into parent values (1, '12')`)
    await run('insert into child values (1, 1)')
    await run('pragma foreign_keys = on')
    try {
      await push(db, Parent, Child, {force: true})
      test.equal(await db.select().from(Parent), [{id: 1, code: 12}])
      test.equal(await db.select().from(Child), [{id: 1, parent: 1}])
      test.equal(
        {...(await db.get(sql<object>`pragma foreign_keys`))},
        {foreign_keys: 1}
      )
    } finally {
      await run('pragma foreign_keys = off')
      await reset()
    }
  })

  test('rebuild checks foreign keys', async () => {
    await reset()
    await run('create table parent (id integer primary key, code integer)')
    await run('create table child (id integer primary key, parent integer)')
    await run('insert into child values (1, 2)')
    await run('pragma foreign_keys = on')
    try {
      const error = await Promise.resolve()
        .then(() => push(db, Parent, Child))
        .then(
          () => '',
          error => error.message
        )
      test.equal(error, 'Push would violate foreign key constraints')
      test.equal(
        failure(() => push.plan(db, Child)),
        'Push would violate foreign key constraints'
      )
      test.equal(await db.$count(sql`child`), 1)
      test.equal(
        {...(await db.get(sql<object>`pragma foreign_keys`))},
        {foreign_keys: 1}
      )
    } finally {
      await run('pragma foreign_keys = off')
      await reset()
    }
  })

  test('rebuild keeps triggers and views', async () => {
    await reset()
    await run('create table log (message text)')
    await run('create table parent (id integer primary key, code text)')
    await run(`insert into parent values (1, '7')`)
    await run(`create view parent_codes as select code from parent`)
    await run(
      `create trigger parent_insert after insert on parent begin insert into log values ('inserted'); end`
    )
    try {
      await push(db, Parent, {force: true})
      await db.insert(Parent).values({id: 2, code: 8})
      test.equal(await db.select().from(Log), [{message: 'inserted'}])
      test.equal(
        (await db.all(sql<object>`select code from parent_codes`)).map(row => ({
          ...row
        })),
        [{code: 7}, {code: 8}]
      )
      test.equal(await push.plan(db, Parent), [])
    } finally {
      await reset()
    }
  })

  test('rebuild inside a transaction needs foreign keys off', async () => {
    await reset()
    await run('create table parent (id integer primary key, code text)')
    await run('pragma foreign_keys = on')
    try {
      const error = await Promise.resolve()
        .then(() =>
          db.transaction(async tx => {
            await push(tx, Parent)
          })
        )
        .then(
          () => '',
          error => error.message
        )
      test.equal(error, 'Cannot rebuild with foreign keys enforced')
    } finally {
      await run('pragma foreign_keys = off')
      await reset()
    }
  })

  test('rebuild of an unchanged table does nothing', async () => {
    await reset()
    try {
      await push(db, Parent, Child)
      test.equal(await push.plan(db, Parent, Child), [])
    } finally {
      await reset()
    }
  })

  const fresh = async (...names: Array<string>) => {
    await run('drop view if exists v')
    for (const name of names) await run(`drop table if exists ${name}`)
  }
  const all = (query: string) =>
    db.all(sql.unsafe(query) as Sql<object>).map(row => ({...row}))

  test('rebuild without a common column keeps every row', async () => {
    // The new primary key forces a rebuild that has no column to copy
    const R = table('r', {b: integer().primaryKey()})
    await fresh('r')
    await run('create table r (a text)')
    await run('insert into r values (null), (null)')
    try {
      await push(db, R)
      test.equal(all('select b from r'), [{b: 1}, {b: 2}])
      await fresh('r')
      await run('create table r (a text)')
      await run(`insert into r values ('kept')`)
      test.equal(
        failure(() => push(db, R))?.startsWith(
          'Push would drop column "a" with data'
        ),
        true
      )
      test.equal(all('select a from r'), [{a: 'kept'}])
    } finally {
      await fresh('r')
    }
  })

  test('rebuild keeps triggers on views', async () => {
    await fresh('log', 'parent')
    await run('create table log (message text)')
    await run('create table parent (id integer primary key, code text)')
    await run('create view v as select id, code from parent')
    await run(
      `create trigger v_insert instead of insert on v begin insert into log values ('via view'); end`
    )
    try {
      await push(db, Parent)
      await run('insert into v values (1, 2)')
      test.equal(all('select message from log'), [{message: 'via view'}])
    } finally {
      await fresh('log', 'parent')
    }
  })

  test('rebuild keeps rowids and the autoincrement counter', async () => {
    const Counter = table('counter', {
      id: integer().primaryKey({autoIncrement: true}),
      v: integer()
    })
    const Plain = table('plain', {v: integer()})
    await fresh('counter', 'plain')
    await run(
      'create table counter (id integer primary key autoincrement, v text)'
    )
    await run('insert into counter values (1, 1), (100, 2)')
    await run('delete from counter where id = 100')
    await run('create table plain (v text, w text)')
    await run('insert into plain (rowid, v) values (5, 1), (9, 2)')
    try {
      await push(db, Counter, Plain, {force: true})
      await db.insert(Counter).values({v: 3})
      test.equal(all('select id from counter'), [{id: 1}, {id: 101}])
      test.equal(all('select rowid as id, v from plain'), [
        {id: 5, v: 1},
        {id: 9, v: 2}
      ])
    } finally {
      await fresh('counter', 'plain')
    }
  })

  test('rebuild copies values as they are', async () => {
    const Wide = table('wide', {v: custom('bigint'), w: text().notNull()})
    await fresh('wide')
    await run('create table wide (v integer, w text)')
    await run(`insert into wide values ('abc', 'x')`)
    try {
      await push(db, Wide)
      test.equal(all('select v, typeof(v) as type from wide'), [
        {v: 'abc', type: 'text'}
      ])
    } finally {
      await fresh('wide')
    }
  })

  test('partial index keeps the case of its literals', async () => {
    const Members = table('members', {code: integer(), s: text()}, t => ({
      members_vip: uniqueIndex()
        .on(t.code)
        .where(sql`${t.s} = 'vip'`)
    }))
    await fresh('members')
    await run('create table members (code integer, s text)')
    await run(
      `create unique index members_vip on members (code) where s = 'VIP'`
    )
    try {
      await push(db, Members)
      test.equal(push.plan(db, Members), [])
      await run(`insert into members values (1, 'vip')`)
      test.throws(() => run(`insert into members values (1, 'vip')`))
    } finally {
      await fresh('members')
    }
  })

  test('push checks foreign keys when they are not enforced', async () => {
    await fresh('child', 'parent')
    await run('create table parent (id integer primary key, code integer)')
    await run('create table child (id integer primary key, parent integer)')
    await run('insert into child values (1, 2)')
    try {
      test.equal(
        failure(() => push(db, Parent, Child)),
        'Push would violate foreign key constraints'
      )
      test.equal(all(`select * from pragma_foreign_key_list('child')`), [])
      test.equal(all('select parent from child'), [{parent: 2}])
      test.equal(all('pragma foreign_keys'), [{foreign_keys: 0}])
    } finally {
      await fresh('child', 'parent')
    }
  })

  test('rebuild keeps rowids behind a column named rowid', async () => {
    const Shadowed = table('shadowed', {rowid: text(), v: text().unique()})
    const Hidden = table('hidden', {
      rowid: text(),
      _rowid_: text(),
      oid: text(),
      v: text().unique()
    })
    await fresh('shadowed', 'hidden')
    await run('create table shadowed (rowid text, v text)')
    await run(
      `insert into shadowed (_rowid_, rowid, v) values (42, 'user', 'x')`
    )
    await run(
      'create table hidden (rowid text, _rowid_ text, oid text, v text)'
    )
    try {
      await push(db, Shadowed)
      test.equal(all('select _rowid_ as id, rowid, v from shadowed'), [
        {id: 42, rowid: 'user', v: 'x'}
      ])
      test.equal(
        failure(() => push(db, Hidden)),
        'Cannot rebuild "hidden", its columns hide the rowid'
      )
    } finally {
      await fresh('shadowed', 'hidden')
    }
  })

  test('live index names keep the scratch prefix', async () => {
    const Prefixed = table('prefixed', {v: integer()}, t => ({
      __rado_v: index().on(t.v)
    }))
    await fresh('prefixed')
    try {
      await push(db, Prefixed)
      test.equal(push.plan(db, Prefixed), [])
      test.equal(all(`select name from pragma_index_list('prefixed')`), [
        {name: '__rado_v'}
      ])
    } finally {
      await fresh('prefixed')
    }
  })
}

const dialect = {
  push,
  inspect: (db: Database, t: Parameters<typeof getTable>[0]) =>
    inspect(db, getTable(t).name),
  drop: (name: string) => `drop table if exists "${name}"`
}

if (isBun) {
  const {'bun:sqlite': connect} = await import('#/driver.ts')
  const {Database} = await import('bun:sqlite')
  const db = connect(new Database(':memory:'))
  testCases(db, test, dialect, cases)
  testRebuild(db)
} else if (isNode) {
  const {'node:sqlite': connect} = await import('#/driver.ts')
  const sqlite = 'node:sqlite'
  const {DatabaseSync} = await import(sqlite)
  const db = connect(new DatabaseSync(':memory:'))
  testCases(db, test, dialect, cases)
  testRebuild(db)
}
