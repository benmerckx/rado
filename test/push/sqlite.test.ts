import {suite} from '@alinea/suite'
import {Column, column} from '#/core/Column.ts'
import {
  type Database,
  foreignKey,
  getTable,
  index,
  primaryKey,
  sql,
  table,
  uniqueIndex
} from '#/index.ts'
import {push} from '#/push.ts'
import {integer, numeric, text} from '#/sqlite.ts'
import {inspect} from '#/sqlite/push.ts'
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

function testRebuild(db: Database) {
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
      test.equal((await push.plan(db, Child)).length > 0, true)
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
      test.equal(
        error,
        'Cannot rebuild a table while foreign keys are enforced'
      )
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
}

const dialect = {
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
