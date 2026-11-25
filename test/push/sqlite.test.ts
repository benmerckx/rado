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
import {blob, integer, numeric, text} from '#/sqlite.ts'
import {push} from '#/sqlite/push.ts'
import {shape} from '#/sqlite/shape.ts'
import {isBun, isNode} from '../TestRuntime.ts'
import {failure, fixture} from '../TestUtils.ts'
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
  const all = (query: string) =>
    db.all(sql.unsafe(query) as Sql<object>).map(row => ({...row}))
  // Drops every table and view, tests start and end without any
  const empty = () => {
    run('pragma foreign_keys = off')
    for (const schema of ['temp', 'main']) {
      const objects = db.all(
        sql<{
          type: string
          name: string
        }>`select type, name from ${sql.identifier(
          schema
        )}.sqlite_master where type in ('view', 'table') and name not like 'sqlite_%' order by type = 'table'`
      )
      for (const {type, name} of objects)
        run(`drop ${type} ${schema}."${name.replaceAll('"', '""')}"`)
    }
  }

  test('rebuild keeps rows that reference the table', async () => {
    await fixture(empty, async () => {
      await run('create table parent (id integer primary key, code text)')
      await run(
        'create table child (id integer primary key, parent integer references parent(id) on delete cascade)'
      )
      await run(`insert into parent values (1, '12')`)
      await run('insert into child values (1, 1)')
      await run('pragma foreign_keys = on')
      await push(db, {Parent, Child}, {force: true})
      test.equal(await db.select().from(Parent), [{id: 1, code: 12}])
      test.equal(await db.select().from(Child), [{id: 1, parent: 1}])
      test.equal(
        {...(await db.get(sql<object>`pragma foreign_keys`))},
        {foreign_keys: 1}
      )
    })
  })

  test('rebuild checks foreign keys', async () => {
    await fixture(empty, async () => {
      await run('create table parent (id integer primary key, code integer)')
      await run('create table child (id integer primary key, parent integer)')
      await run('insert into child values (1, 2)')
      await run('pragma foreign_keys = on')
      const error = await failure(() => push(db, {Parent, Child}))
      test.equal(error, 'Push would violate foreign key constraints')
      test.equal(
        await failure(() => push.plan(db, {Child})),
        'Push would violate foreign key constraints'
      )
      test.equal(await db.$count(sql`child`), 1)
      test.equal(
        {...(await db.get(sql<object>`pragma foreign_keys`))},
        {foreign_keys: 1}
      )
    })
  })

  test('rebuild keeps triggers and views', async () => {
    await fixture(empty, async () => {
      await run('create table log (message text)')
      await run('create table parent (id integer primary key, code text)')
      await run(`insert into parent values (1, '7')`)
      await run(`create view parent_codes as select code from parent`)
      await run(
        `create trigger parent_insert after insert on parent begin insert into log values ('inserted'); end`
      )
      await push(db, {Parent}, {force: true})
      await db.insert(Parent).values({id: 2, code: 8})
      test.equal(await db.select().from(Log), [{message: 'inserted'}])
      test.equal(
        (await db.all(sql<object>`select code from parent_codes`)).map(row => ({
          ...row
        })),
        [{code: 7}, {code: 8}]
      )
      test.equal(await push.plan(db, {Parent}), [])
    })
  })

  test('a trigger named after its table', async () => {
    await fixture(empty, async () => {
      const Counter = table('log', {id: integer().primaryKey().autoincrement()})
      await push(db, {Counter})
      await run('create trigger log after insert on log begin select 1; end')
      test.equal(await push.plan(db, {Counter}), [])
    })
  })

  test('rebuild in a transaction', async () => {
    await fixture(empty, async () => {
      await run('create table parent (id integer primary key, code text)')
      await run('pragma foreign_keys = on')
      const error = await failure(() =>
        db.transaction(async tx => {
          await push(tx, {Parent})
        })
      )
      test.equal(error, 'Cannot rebuild with foreign keys enforced')
    })
  })

  test('rebuild of an unchanged table does nothing', async () => {
    await fixture(empty, async () => {
      await push(db, {Parent, Child})
      test.equal(await push.plan(db, {Parent, Child}), [])
    })
  })

  test('rebuild without a common column', async () => {
    // The new primary key forces a rebuild that has no column to copy
    const R = table('r', {b: integer().primaryKey()})
    await fixture(empty, async () => {
      await run('create table r (a text)')
      await run('insert into r values (null), (null)')
      await push(db, {R})
      test.equal(all('select b from r'), [{b: 1}, {b: 2}])
      empty()
      await run('create table r (a text)')
      await run(`insert into r values ('kept')`)
      test.equal(
        (await failure(() => push(db, {R}))).startsWith(
          'Push would drop column "a" with data'
        ),
        true
      )
      test.equal(all('select a from r'), [{a: 'kept'}])
    })
  })

  test('rebuild keeps triggers on views', async () => {
    await fixture(empty, async () => {
      await run('create table log (message text)')
      await run('create table parent (id integer primary key, code text)')
      await run('create view v as select id, code from parent')
      await run(
        `create trigger v_insert instead of insert on v begin insert into log values ('via view'); end`
      )
      await push(db, {Parent})
      await run('insert into v values (1, 2)')
      test.equal(all('select message from log'), [{message: 'via view'}])
    })
  })

  test('rebuild keeps autoincrement', async () => {
    const Counter = table('counter', {
      id: integer().primaryKey({autoIncrement: true}),
      v: integer()
    })
    const Plain = table('plain', {v: integer()})
    await fixture(empty, async () => {
      await run(
        'create table counter (id integer primary key autoincrement, v text)'
      )
      await run('insert into counter values (1, 1), (100, 2)')
      await run('delete from counter where id = 100')
      await run('create table plain (v text, w text)')
      await run('insert into plain (rowid, v) values (5, 1), (9, 2)')
      await push(db, {Counter, Plain}, {force: true})
      await db.insert(Counter).values({v: 3})
      test.equal(all('select id from counter'), [{id: 1}, {id: 101}])
      test.equal(all('select rowid as id, v from plain'), [
        {id: 5, v: 1},
        {id: 9, v: 2}
      ])
    })
  })

  test('rebuild copies values as they are', async () => {
    const Wide = table('wide', {v: custom('bigint'), w: text().notNull()})
    await fixture(empty, async () => {
      await run('create table wide (v integer, w text)')
      await run(`insert into wide values ('abc', 'x')`)
      await push(db, {Wide})
      test.equal(all('select v, typeof(v) as type from wide'), [
        {v: 'abc', type: 'text'}
      ])
    })
  })

  test('partial index keeps the case of its literals', async () => {
    const Members = table('members', {code: integer(), s: text()}, t => ({
      members_vip: uniqueIndex()
        .on(t.code)
        .where(sql`${t.s} = 'vip'`)
    }))
    await fixture(empty, async () => {
      await run('create table members (code integer, s text)')
      await run(
        `create unique index members_vip on members (code) where s = 'VIP'`
      )
      await push(db, {Members})
      test.equal(push.plan(db, {Members}), [])
      await run(`insert into members values (1, 'vip')`)
      test.throws(() => run(`insert into members values (1, 'vip')`))
    })
  })

  test('check unenforced foreign keys', async () => {
    await fixture(empty, async () => {
      await run('create table parent (id integer primary key, code integer)')
      await run('create table child (id integer primary key, parent integer)')
      await run('insert into child values (1, 2)')
      test.equal(
        await failure(() => push(db, {Parent, Child})),
        'Push would violate foreign key constraints'
      )
      test.equal(all(`select * from pragma_foreign_key_list('child')`), [])
      test.equal(all('select parent from child'), [{parent: 2}])
      test.equal(all('pragma foreign_keys'), [{foreign_keys: 0}])
    })
  })

  test('push keeps keys that other tables reference', async () => {
    const Owner = table('owner', {id: integer(), code: text()})
    await fixture(empty, async () => {
      await run('create table owner (id integer, code text unique)')
      await run('create table pet (owner text references owner(code))')
      await run(`insert into owner values (1, 'a')`)
      await run(`insert into pet values ('a')`)
      test.equal(
        (await failure(() => push(db, {Owner}))).startsWith(
          'Push would break a foreign key: foreign key mismatch'
        ),
        true
      )
      test.equal(all(`select "unique" from pragma_index_list('owner')`), [
        {unique: 1}
      ])
      // An orphan the push didn't make doesn't block it
      await run('create table stray (owner text references owner(code))')
      await run(`insert into stray values ('missing')`)
      const Pushed = table('owner', {
        id: integer(),
        code: text().unique(),
        extra: text()
      })
      await push(db, {Pushed})
      test.equal(all('select code, extra from owner'), [
        {code: 'a', extra: null}
      ])
    })
  })

  test('autoincrement beyond 2^53', async () => {
    const Big = table('big', {
      id: integer().primaryKey({autoIncrement: true}),
      v: integer()
    })
    await fixture(empty, async () => {
      await run(
        'create table big (id integer primary key autoincrement, v text)'
      )
      await run('insert into big values (9007199254740993, 1)')
      await run('delete from big')
      await push(db, {Big})
      await run('insert into big (v) values (2)')
      test.equal(all('select cast(id as text) as id from big'), [
        {id: '9007199254740994'}
      ])
    })
  })

  test('malformed foreign key', async () => {
    const Parent = table('fk_parent', {id: integer(), v: text()})
    await fixture(empty, async () => {
      await run('create table fk_parent (id integer primary key, v text)')
      await run('create table fk_child (pid integer references fk_parent(id))')
      await run('insert into fk_parent values (1, null)')
      await run('insert into fk_child values (1)')
      await run('create table fk_other (code text)')
      await run('create table fk_bad (code text references fk_other(code))')
      test.equal(
        await failure(() => push(db, {Parent})),
        'Cannot check foreign keys: foreign key mismatch - "fk_bad" referencing "fk_other"'
      )
      test.equal(all(`select pk from pragma_table_info('fk_parent')`), [
        {pk: 1},
        {pk: 0}
      ])
    })
  })

  test('temporary table shadows', async () => {
    const Logs = table('logs', {id: integer()})
    await fixture(empty, async () => {
      await run('drop table if exists temp.logs')
      await run('create table main.logs (id integer, notes text)')
      await run('create temp table logs (id integer, notes text)')
      await run(`insert into main.logs values (1, 'main')`)
      await run(`insert into temp.logs values (2, 'temp')`)
      test.equal(
        await failure(() => push(db, {Logs}, {force: true})),
        'Cannot push "logs", a temporary "logs" shadows it'
      )
      test.equal(all('select id, notes from main.logs'), [
        {id: 1, notes: 'main'}
      ])
      test.equal(all('select id, notes from temp.logs'), [
        {id: 2, notes: 'temp'}
      ])
    })
  })

  test('descending integer primary key', async () => {
    // The primary key becoming the rowid is the only difference
    const Desc = table('desc_k', {id: integer().primaryKey(), v: text()})
    await fixture(empty, async () => {
      await run('create table desc_k (id integer primary key desc, v text)')
      await run(`insert into desc_k (rowid, id, v) values (42, 1, 'a')`)
      test.equal(
        (await failure(() => push(db, {Desc}))).startsWith(
          'Push would change the rowids of "desc_k" to "id"'
        ),
        true
      )
      test.equal(all('select _rowid_ as rowid, id from desc_k'), [
        {rowid: 42, id: 1}
      ])
      await push(db, {Desc}, {force: true})
      test.equal(push.plan(db, {Desc}), [])
      await run(`insert into desc_k (v) values ('b')`)
      test.equal(all('select id, v from desc_k order by id'), [
        {id: 1, v: 'a'},
        {id: 2, v: 'b'}
      ])
    })
  })

  test('rebuild without rowid or columns', async () => {
    const Replaced = table('replaced', {c: integer().primaryKey()})
    await fixture(empty, async () => {
      await run(
        'create table replaced (a text primary key, b text) without rowid'
      )
      await push(db, {Replaced})
      test.equal(push.plan(db, {Replaced}), [])
      await run('insert into replaced (c) values (null)')
      test.equal(all('select c from replaced'), [{c: 1}])
      empty()
      await run(
        'create table replaced (a text primary key, b text) without rowid'
      )
      await run(`insert into replaced values ('x', 'y')`)
      test.equal(
        await failure(() => push(db, {Replaced}, {force: true})),
        'Cannot rebuild "replaced", no column of its rows stays'
      )
      test.equal(all('select a, b from replaced'), [{a: 'x', b: 'y'}])
    })
  })

  test('push compares temporary names without case', async () => {
    const Mixed = table('mixed', {id: integer()})
    await fixture(empty, async () => {
      await run('drop table if exists temp.MIXED')
      await run('create table main.mixed (id integer, payload text)')
      await run('create temp table MIXED (id integer, payload text)')
      await run(`insert into main.mixed values (1, 'main')`)
      await run(`insert into temp.MIXED values (2, 'temp')`)
      test.equal(
        await failure(() => push(db, {Mixed}, {force: true})),
        'Cannot push "mixed", a temporary "MIXED" shadows it'
      )
      test.equal(all('select id, payload from main.mixed'), [
        {id: 1, payload: 'main'}
      ])
      test.equal(all('select id, payload from temp.mixed'), [
        {id: 2, payload: 'temp'}
      ])
    })
  })

  test('rebuild keeps other triggers', async () => {
    const Audit = table('audit', {message: text().default('logged')})
    await fixture(empty, async () => {
      await run('create table audit (message text)')
      await run('create table events (id integer)')
      await run(
        `create trigger events_audit after insert on events begin insert into audit (rowid) values (null); end`
      )
      await push(db, {Audit})
      await run('insert into events values (1)')
      test.equal(all('select message from audit'), [{message: 'logged'}])
    })
  })

  test('rebuild adds a column named rowid', async () => {
    const Named = table('named', {
      v: text().unique(),
      rowid: text('rowid').notNull().default('n')
    })
    await fixture(empty, async () => {
      await run('create table named (v text)')
      await run(`insert into named (rowid, v) values (42, 'a')`)
      await push(db, {Named})
      test.equal(all('select _rowid_ as id, v, rowid from named'), [
        {id: 42, v: 'a', rowid: 'n'}
      ])
    })
  })

  test('rebuild keeps rowids', async () => {
    const Keyed = table('keyed', {id: integer().primaryKey(), v: text()})
    await fixture(empty, async () => {
      await run('create table keyed (id integer, v text)')
      await run(
        `insert into keyed (rowid, id, v) values (77, 10, 'a'), (81, null, 'b')`
      )
      test.equal(
        (await failure(() => push(db, {Keyed}))).startsWith(
          'Push would change the rowids of "keyed" to "id"'
        ),
        true
      )
      test.equal(all('select _rowid_ as rowid, id from keyed'), [
        {rowid: 77, id: 10},
        {rowid: 81, id: null}
      ])
      await run('update keyed set id = rowid')
      await push(db, {Keyed})
      test.equal(all('select _rowid_ as rowid, id, v from keyed'), [
        {rowid: 77, id: 77, v: 'a'},
        {rowid: 81, id: 81, v: 'b'}
      ])
    })
  })

  test('rebuild reads without rowid', async () => {
    const Worded = table('worded', {
      id: integer(),
      s: text().default('without rowid').unique()
    })
    await fixture(empty, async () => {
      await run(
        `create table worded (id integer, s text default 'without rowid')`
      )
      await run(`insert into worded (rowid, id, s) values (77, 1, 'a')`)
      await push(db, {Worded})
      test.equal(all('select _rowid_ as rowid, s from worded'), [
        {rowid: 77, s: 'a'}
      ])
    })
  })

  test('column named rowid', async () => {
    const Shadowed = table('shadowed', {rowid: text(), v: text().unique()})
    const Hidden = table('hidden', {
      rowid: text(),
      _rowid_: text(),
      oid: text(),
      v: text().unique()
    })
    await fixture(empty, async () => {
      await run('create table shadowed (rowid text, v text)')
      await run(
        `insert into shadowed (_rowid_, rowid, v) values (42, 'user', 'x')`
      )
      await run(
        'create table hidden (rowid text, _rowid_ text, oid text, v text)'
      )
      await push(db, {Shadowed})
      test.equal(all('select _rowid_ as id, rowid, v from shadowed'), [
        {id: 42, rowid: 'user', v: 'x'}
      ])
      test.equal(
        await failure(() => push(db, {Hidden})),
        'Cannot rebuild "hidden", its columns hide the rowid'
      )
    })
  })

  test('defaults of bytes, bigints and dates', async () => {
    const Defaults = table('defaults', {
      id: integer(),
      bytes: blob().default(new Uint8Array([4])),
      big: blob({mode: 'bigint'}).default(2n),
      at: integer({mode: 'timestamp'}).default(new Date(0))
    })
    await fixture(empty, async () => {
      await push(db, {Defaults})
      test.equal(push.plan(db, {Defaults}), [])
      await db.insert(Defaults).values({id: 1})
      test.equal(await db.select().from(Defaults), [
        {id: 1, bytes: new Uint8Array([4]), big: 2n, at: new Date(0)}
      ])
    })
  })

  test('live index names keep the scratch prefix', async () => {
    const Prefixed = table('prefixed', {v: integer()}, t => ({
      __rado_v: index().on(t.v)
    }))
    await fixture(empty, async () => {
      await push(db, {Prefixed})
      test.equal(push.plan(db, {Prefixed}), [])
      test.equal(all(`select name from pragma_index_list('prefixed')`), [
        {name: '__rado_v'}
      ])
    })
  })
}

const dialect = {
  push,
  shape: (db: Database, t: Parameters<typeof getTable>[0]) =>
    shape(db, getTable(t).name),
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
