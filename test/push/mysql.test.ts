import {suite} from '@alinea/suite'
import {Column, column} from '#/core/Column.ts'
import {
  type AsyncDatabase,
  type Index,
  type Sql,
  type Table,
  getTable,
  sql
} from '#/index.ts'
import {
  bigint,
  boolean,
  char,
  datetime,
  date,
  foreignKey,
  index,
  int,
  mysqlSchema,
  mysqlTable as table,
  primaryKey,
  text,
  timestamp,
  tinytext,
  unique,
  uniqueIndex,
  varchar
} from '#/mysql.ts'
import {inspect} from '#/mysql/inspect.ts'
import {push} from '#/mysql/push.ts'
import {isDeno, testMysql} from '../TestRuntime.ts'
import {type Case, testCases} from './TestCases.ts'

const test = suite(import.meta)

const id = () => bigint({unsigned: true}).notNull().autoincrement().primaryKey()
const users = table('users', {id: bigint().primaryKey()})
const posts = table('posts', {content: text(), userId: bigint('user_id')})
const name = varchar({length: 40}).default(sql`null`)
const peopleColumns = {
  id: id(),
  name: varchar({length: 40}),
  createdAt: datetime('created_at').notNull()
}
const people = (
  config?: (t: Table<typeof peopleColumns, 'users'>) => Record<string, Index>
) => table('users', peopleColumns, config)

// Ported from sqldef (MIT): cmd/mysqldef/tests_tables.yml, tests_indices.yml
// and tests_constraints.yml
const cases: Record<string, Case> = {
  // tests_tables.yml
  CreateTable: {
    desired: [
      table('users', {
        id: id(),
        name,
        createdAt: datetime('created_at').notNull()
      }),
      table('bigdata', {data: bigint()})
    ]
  },
  CreateTableWithImplicitNotNull: {
    desired: [
      table('users', {
        id: bigint().primaryKey(),
        name,
        createdAt: datetime('created_at').notNull()
      })
    ]
  },
  CreateTableDropPrimaryKey: {
    current: `
      create table users (id bigint not null primary key, name varchar(20));
      insert into users values (1, 'a');
    `,
    desired: [
      table('users', {
        id: bigint().notNull(),
        name: varchar({length: 20})
      })
    ],
    keep: {users: ['id', 'name']}
  },
  CreateTableAddPrimaryKeyInColumn: {
    current: `create table users (id bigint not null, name varchar(20))`,
    desired: [
      table('users', {
        id: bigint().notNull(),
        name: varchar({length: 20}).primaryKey()
      })
    ]
  },
  CreateTableAddPrimaryKey: {
    current: `
      create table users (id bigint not null, name varchar(20));
      insert into users values (1, 'a');
    `,
    desired: [
      table(
        'users',
        {id: bigint().notNull(), name: varchar({length: 20})},
        t => [primaryKey(t.id)]
      )
    ],
    keep: {users: ['id', 'name']}
  },
  CreateTableAddAutoIncrement: {
    current: `
      create table users (id bigint not null primary key, name varchar(20));
      insert into users values (1, 'a');
    `,
    desired: [
      table('users', {
        id: bigint().notNull().autoincrement().primaryKey(),
        name: varchar({length: 20})
      })
    ],
    keep: {users: ['id', 'name']}
  },
  CreateTableChangePrimaryKey: {
    current: `
      create table friends (
        user_id bigint not null primary key,
        friend_id bigint not null,
        created_at datetime not null
      );
      insert into friends values (1, 2, now());
    `,
    desired: [
      table(
        'friends',
        {
          userId: bigint('user_id').notNull(),
          friendId: bigint('friend_id').notNull(),
          createdAt: datetime('created_at').notNull()
        },
        t => [primaryKey(t.userId, t.friendId)]
      )
    ],
    keep: {friends: ['user_id', 'friend_id']}
  },
  AddColumn: {
    current: `
      create table users (
        id bigint unsigned not null auto_increment primary key,
        name varchar(40) default null
      );
    `,
    desired: [people()]
  },
  DropColumn: {
    current: `
      create table users (
        id bigint unsigned not null auto_increment primary key,
        name varchar(40) default null,
        created_at datetime not null
      );
      insert into users (name, created_at) values ('a', now());
    `,
    desired: [
      table('users', {
        id: id(),
        createdAt: datetime('created_at').notNull()
      })
    ],
    options: {force: true},
    keep: {users: ['id', 'created_at']}
  },
  AddColumnWithNull: {
    current: `
      create table users (id bigint primary key, name varchar(40) default null);
      insert into users values (1, 'a');
    `,
    desired: [
      table('users', {
        id: bigint().primaryKey(),
        name,
        createdAt: timestamp('created_at').default(sql`null`)
      })
    ],
    keep: {users: ['id', 'name']}
  },
  ChangeColumn: {
    current: `
      create table users (id int unsigned not null, name varchar(40));
      insert into users values (1, 'a');
    `,
    desired: [
      table('users', {
        id: bigint({unsigned: true}).notNull(),
        name: char({length: 40})
      })
    ],
    options: {force: true},
    keep: {users: ['id', 'name']}
  },
  ChangeColumnLength: {
    current: `
      create table users (id int unsigned not null, name varchar(255));
      insert into users values (1, 'a');
    `,
    desired: [
      table('users', {
        id: new Column({type: column['int unsigned']()}).notNull(),
        name: varchar({length: 1000})
      })
    ],
    keep: {users: ['id', 'name']}
  },
  RenameColumn: {
    current: `
      create table users (id bigint not null, username text, age integer);
      insert into users values (1, 'ada', 3);
    `,
    desired: [
      table('users', {
        id: bigint().notNull(),
        userName: text('user_name'),
        age: int()
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
        id: bigint().notNull(),
        userName: text('user_name').notNull(),
        age: int()
      })
    ],
    options: {rename: {'users.username': 'user_name'}},
    keep: {users: ['id', 'username:user_name', 'age']}
  },
  RenameMultipleColumns: {
    current: `
      create table users (
        id bigint not null, \`user name\` text,
        \`email@address\` varchar(100), age integer
      );
      insert into users values (1, 'ada', 'a@b', 3);
    `,
    desired: [
      table('users', {
        id: bigint().notNull(),
        username: text(),
        emailAddress: varchar('email_address', {length: 100}),
        age: int()
      })
    ],
    options: {
      rename: {
        'users.user name': 'username',
        'users.email@address': 'email_address'
      }
    },
    keep: {
      users: ['id', 'user name:username', 'email@address:email_address']
    }
  },
  AlterColumnSetDefault: {
    current: `
      create table users (id bigint not null, status varchar(20), priority int);
      insert into users values (1, 'a', 2);
    `,
    desired: [
      table('users', {
        id: bigint().notNull(),
        status: varchar({length: 20}).default('active'),
        priority: int().default(1)
      })
    ],
    keep: {users: ['id', 'status', 'priority']}
  },
  AlterColumnDropDefault: {
    current: `
      create table users (
        id bigint not null,
        status varchar(20) default 'active',
        priority int default 1
      );
    `,
    desired: [
      table('users', {
        id: bigint().notNull(),
        status: varchar({length: 20}),
        priority: int()
      })
    ]
  },
  AlterColumnChangeDefault: {
    current: `
      create table users (
        id bigint not null,
        status varchar(20) default 'pending',
        is_active boolean default false
      );
    `,
    desired: [
      table('users', {
        id: bigint().notNull(),
        status: varchar({length: 20}).default('active'),
        isActive: boolean('is_active').default(true)
      })
    ]
  },
  AlterColumnSetNotNull: {
    current: `
      create table users (id bigint not null, name varchar(100), email varchar(255));
      insert into users values (1, 'a', 'b');
    `,
    desired: [
      table('users', {
        id: bigint().notNull(),
        name: varchar({length: 100}).notNull(),
        email: varchar({length: 255}).notNull()
      })
    ],
    keep: {users: ['id', 'name', 'email']}
  },
  AlterColumnDropNotNull: {
    current: `
      create table users (
        id bigint not null, name varchar(100) not null, email varchar(255) not null
      );
    `,
    desired: [
      table('users', {
        id: bigint().notNull(),
        name: varchar({length: 100}),
        email: varchar({length: 255})
      })
    ]
  },
  AlterColumnChangeNotNullAndDefault: {
    current: `
      create table users (
        id bigint not null,
        name varchar(100),
        email varchar(255) not null default 'unknown@example.com'
      );
      insert into users (id, name) values (1, 'a');
    `,
    desired: [
      table('users', {
        id: bigint().notNull(),
        name: varchar({length: 100}).notNull().default('anonymous'),
        email: varchar({length: 255})
      })
    ],
    keep: {users: ['id', 'name', 'email']}
  },
  MultipleUnnamedForeignKeys: {
    desired: (() => {
      const named = (n: string) =>
        table(n, {id: id(), name: varchar({length: 255}).notNull()})
      const [u, c, t] = ['users', 'categories', 'tags'].map(named)
      const ref = () => bigint({unsigned: true})
      return [
        u,
        c,
        t,
        table('articles', {
          id: id(),
          title: varchar({length: 255}).notNull(),
          authorId: ref().notNull().references(u.id),
          categoryId: ref().notNull().references(c.id),
          tagId: ref().references(t.id)
        })
      ]
    })()
  },
  DropUnnamedForeignKey: {
    current: `
      create table users (id bigint unsigned not null auto_increment primary key);
      create table posts (
        id bigint unsigned not null auto_increment primary key,
        user_id bigint unsigned,
        foreign key (user_id) references users(id)
      );
    `,
    desired: [
      table('users', {id: id()}),
      table('posts', {id: id(), userId: bigint('user_id', {unsigned: true})})
    ]
  },
  ModifyUnnamedForeignKey: {
    current: `
      create table users (id bigint unsigned not null auto_increment primary key);
      create table admins (id bigint unsigned not null auto_increment primary key);
      create table posts (
        id bigint unsigned not null auto_increment primary key,
        author_id bigint unsigned,
        foreign key (author_id) references users(id)
      );
    `,
    desired: (() => {
      const admins = table('admins', {id: id()})
      return [
        table('users', {id: id()}),
        admins,
        table('posts', {
          id: id(),
          authorId: bigint('author_id', {unsigned: true}).references(admins.id)
        })
      ]
    })()
  },
  CompositeUnnamedForeignKey: {
    desired: (() => {
      const ref = () => bigint({unsigned: true}).notNull()
      const u = table(
        'users',
        {tenantId: ref(), userId: ref(), name: varchar({length: 255})},
        t => [primaryKey(t.tenantId, t.userId)]
      )
      return [
        table('tenants', {id: id()}),
        u,
        table('posts', {id: id(), tenantId: ref(), authorId: ref()}, t => [
          foreignKey(t.tenantId, t.authorId).references(u.tenantId, u.userId)
        ])
      ]
    })()
  },

  // tests_indices.yml
  CreateTableConstraintUnique: {
    desired: [
      table(
        'foo',
        {
          a: int().notNull().autoincrement().primaryKey(),
          b: int().notNull(),
          c: int().notNull()
        },
        t => ({b_c_uk: unique().on(t.b, t.c)})
      )
    ]
  },
  AddConstraintUnique: {
    current: `
      create table foo (a int not null auto_increment primary key, b int not null, c int not null);
      insert into foo (b, c) values (1, 2);
    `,
    desired: [
      table(
        'foo',
        {
          a: int().notNull().autoincrement().primaryKey(),
          b: int().notNull(),
          c: int().notNull()
        },
        t => ({b_c_uk: unique().on(t.b, t.c)})
      )
    ],
    keep: {foo: ['a', 'b', 'c']}
  },
  CreateTableUniqueIndex: {
    desired: [
      table('items', {id: int().notNull(), created: date().notNull()}, t => ({
        id: uniqueIndex().on(t.id, t.created)
      }))
    ]
  },
  AddIndex: {
    current: `
      create table users (
        id bigint unsigned not null auto_increment primary key,
        name varchar(40) default null,
        created_at datetime not null
      );
    `,
    desired: [people(t => ({index_name: uniqueIndex().on(t.name)}))]
  },
  ChangeIndexColumns: {
    current: `
      create table users (
        id bigint unsigned not null auto_increment primary key,
        name varchar(40) default null,
        created_at datetime not null
      );
      alter table users add unique index index_name (name);
    `,
    desired: [people(t => ({index_name: index().on(t.name, t.createdAt)}))]
  },
  CreateIndex: {
    current: `
      create table users (
        id bigint unsigned not null auto_increment primary key,
        name varchar(40) default null,
        created_at datetime not null
      );
    `,
    desired: [
      people(t => ({
        index_name: index().on(t.name),
        index_created_at: uniqueIndex().on(t.createdAt)
      }))
    ]
  },
  CreateIndexDrop: {
    current: `
      create table users (
        id bigint unsigned not null auto_increment primary key,
        name varchar(40) default null,
        created_at datetime not null
      );
      create index index_name on users (name);
      create unique index index_created_at on users (created_at);
    `,
    desired: [people()]
  },
  CreateTableWithUniqueColumnDrop: {
    current: `create table users (id bigint primary key, name varchar(40) unique)`,
    desired: [users],
    options: {force: true}
  },
  CreateTableWithUniqueColumn: {
    current: `create table users (id bigint primary key)`,
    desired: [
      table('users', {
        id: bigint().primaryKey(),
        name: varchar({length: 40}).unique()
      })
    ]
  },
  CreateTableChangeUniqueColumn: {
    current: `create table users (name varchar(40)); insert into users values ('a')`,
    desired: [table('users', {name: varchar({length: 40}).unique()})],
    keep: {users: ['name']}
  },
  ChangeIndexCombination: {
    current: `
      create table users (
        id bigint, name varchar(255), account_id bigint,
        key index_users1 (account_id),
        key index_users2 (account_id, name)
      );
    `,
    desired: [
      table(
        'users',
        {
          id: bigint(),
          name: varchar({length: 255}),
          accountId: bigint('account_id')
        },
        t => ({
          index_users1: index().on(t.accountId, t.name),
          index_users2: index().on(t.accountId)
        })
      )
    ]
  },
  AddUnnamedUniqueConstraint: {
    current: `
      create table t (x bigint, y text);
      alter table t add unique (x);
    `,
    desired: [table('t', {x: bigint().unique(), y: text()})]
  },

  // tests_constraints.yml
  ForeignKeyNormalizeRestrict: {
    desired: (() => {
      const groups = table('groups', {
        id: bigint().notNull().autoincrement().primaryKey()
      })
      return [
        groups,
        table('users', {
          id: bigint().notNull().autoincrement().primaryKey(),
          groupId: bigint('group_id')
            .notNull()
            .references(groups.id, {onDelete: 'restrict', onUpdate: 'cascade'})
        })
      ]
    })()
  },
  AddForeignKeyWithAlter: {
    current: `
      create table users (id bigint primary key);
      create table posts (content text, user_id bigint);
      insert into users values (1);
      insert into posts values ('a', 1);
    `,
    desired: [
      users,
      table('posts', {
        content: text(),
        userId: bigint('user_id').references(users.id, {
          onDelete: 'set null',
          onUpdate: 'cascade'
        })
      })
    ],
    keep: {posts: ['content', 'user_id']}
  },
  CreateTableForeignKey: {
    current: `
      create table users (id bigint primary key);
      create table posts (content text, user_id bigint);
    `,
    desired: [
      users,
      table('posts', {content: text(), userId: bigint('user_id')}, t => ({
        posts_ibfk_1: foreignKey(t.userId).references(users.id)
      }))
    ]
  },
  CreateTableForeignKeyWithOptions: {
    current: `
      create table users (id bigint primary key);
      create table posts (
        content text, user_id bigint,
        constraint posts_ibfk_1 foreign key (user_id) references users (id)
      );
    `,
    desired: [
      users,
      table('posts', {
        content: text(),
        userId: bigint('user_id').references(users.id, {onDelete: 'cascade'})
      })
    ]
  },
  DropForeignKey: {
    current: `
      create table users (id bigint primary key);
      create table posts (
        content text, user_id bigint,
        constraint posts_ibfk_1 foreign key (user_id) references users (id)
          on delete cascade
      );
    `,
    desired: [users, posts]
  }
}

function testRegressions(db: AsyncDatabase<'mysql'>) {
  const run = (query: string) => db.run(sql.unsafe(query))
  const all = (query: string) => db.all(sql.unsafe(query) as Sql<object>)
  const fails = (run: () => unknown) =>
    Promise.resolve()
      .then(run)
      .then(
        () => '',
        error => String(error.message)
      )

  test('plan leaves a table named like the old scratch table', async () => {
    const Victim = table('victim', {id: int(), extra: int()})
    await run('drop table if exists victim, __rado_victim')
    await run('create table victim (id int)')
    await run('create table __rado_victim (sentinel int)')
    await run('insert into __rado_victim values (42)')
    try {
      test.equal(await push.plan(db, Victim), [
        'alter table `victim` add column `extra` integer'
      ])
      test.equal(await all('select sentinel from __rado_victim'), [
        {sentinel: 42}
      ])
    } finally {
      await run('drop table if exists victim, __rado_victim')
    }
  })

  test('a failing push leaves the table as it was', async () => {
    const T = table('atomic_t', {a: int(), b: int()}, t => ({
      i: uniqueIndex().on(t.a)
    }))
    await run('drop table if exists atomic_t')
    await run('create table atomic_t (a int, key i (a))')
    await run('insert into atomic_t values (1), (1)')
    try {
      test.equal((await fails(() => push(db, T))).includes('Duplicate'), true)
      test.equal(
        await all(
          `select index_name as name, non_unique as nonUnique from information_schema.statistics where table_schema = database() and table_name = 'atomic_t'`
        ),
        [{name: 'i', nonUnique: 1}]
      )
      test.equal(
        await all(
          `select column_name as name from information_schema.columns where table_schema = database() and table_name = 'atomic_t'`
        ),
        [{name: 'a'}]
      )
      test.equal(await all('select a from atomic_t'), [{a: 1}, {a: 1}])
    } finally {
      await run('drop table if exists atomic_t')
    }
  })

  test('plan refuses inside a transaction', async () => {
    const T = table('trx_t', {id: int(), extra: int()})
    await run('drop table if exists trx_t')
    await run('create table trx_t (id int)')
    try {
      const error = await fails(() =>
        db.transaction(async tx => {
          await tx.run(sql`insert into trx_t values (1)`)
          const planned = await fails(() => push.plan(tx, T))
          throw new Error(planned)
        })
      )
      test.equal(error, 'Cannot push inside a MySQL transaction')
      test.equal(await all('select id from trx_t'), [])
    } finally {
      await run('drop table if exists trx_t')
    }
  })

  test('push keeps same-named tables in two databases apart', async () => {
    const archive = mysqlSchema('push_archive')
    const Parent = table('dup_parent', {id: int().primaryKey()})
    const ArchiveParent = archive.table('dup_parent', {id: int().primaryKey()})
    const Dup = table('dup', {
      id: int(),
      a: int(),
      pid: int().references(Parent.id)
    })
    const ArchiveDup = archive.table('dup', {
      id: int(),
      b: text(),
      c: int(),
      pid: int().references(ArchiveParent.id)
    })
    const reset = async () => {
      await run('create database if not exists push_archive')
      await run('drop table if exists dup, push_archive.dup')
      await run('drop table if exists dup_parent, push_archive.dup_parent')
    }
    await reset()
    await run('create table dup_parent (id int primary key)')
    await run('create table push_archive.dup_parent (id int primary key)')
    await run(
      'create table dup (id int, a int, pid int, foreign key (pid) references push_archive.dup_parent (id))'
    )
    await run('create table push_archive.dup (id int, b text, pid int)')
    await run('insert into dup_parent values (1)')
    await run('insert into push_archive.dup_parent values (1)')
    await run('insert into dup values (1, 10, 1)')
    await run(`insert into push_archive.dup values (1, 'x', 1)`)
    const describe = (schema: string) =>
      all(
        `select column_name as name from information_schema.columns where table_schema = '${schema}' and table_name = 'dup' order by ordinal_position`
      )
    const target = (schema: string) =>
      all(
        `select referenced_table_schema as target from information_schema.key_column_usage where table_schema = '${schema}' and table_name = 'dup' and referenced_table_name is not null`
      )
    try {
      await push(db, Parent, ArchiveParent, Dup, ArchiveDup)
      test.equal(await describe('mysql'), [
        {name: 'id'},
        {name: 'a'},
        {name: 'pid'}
      ])
      test.equal(await describe('push_archive'), [
        {name: 'id'},
        {name: 'b'},
        {name: 'pid'},
        {name: 'c'}
      ])
      test.equal(await target('mysql'), [{target: 'mysql'}])
      test.equal(await target('push_archive'), [{target: 'push_archive'}])
      test.equal(await all('select id, a, pid from dup'), [
        {id: 1, a: 10, pid: 1}
      ])
      test.equal(await all('select id, b, pid from push_archive.dup'), [
        {id: 1, b: 'x', pid: 1}
      ])
      test.equal(
        await push.plan(db, Parent, ArchiveParent, Dup, ArchiveDup),
        []
      )
    } finally {
      await reset()
      await run('drop database push_archive')
    }
  })

  test('a new table with a failing index is not created', async () => {
    const T = table('bad_new', {t: text()}, t => ({i: index().on(t.t)}))
    await run('drop table if exists bad_new')
    try {
      test.equal(
        (await fails(() => push(db, T))).includes('without a key length'),
        true
      )
      test.equal(
        await all(
          `select table_name from information_schema.tables where table_schema = database() and table_name = 'bad_new'`
        ),
        []
      )
    } finally {
      await run('drop table if exists bad_new')
    }
  })

  test('push refuses dropping fractional seconds', async () => {
    const T = table('fsp_t', {at: datetime()})
    await run('drop table if exists fsp_t')
    await run('create table fsp_t (at datetime(6))')
    await run(`insert into fsp_t values ('2026-01-02 03:04:05.678901')`)
    try {
      test.equal(
        (await fails(() => push(db, T))).startsWith(
          'Push would change column "at" from datetime(6) to datetime'
        ),
        true
      )
      test.equal(await all('select microsecond(at) as us from fsp_t'), [
        {us: 678901}
      ])
    } finally {
      await run('drop table if exists fsp_t')
    }
  })

  test('push refuses index options MySQL lacks before creating anything', async () => {
    const Plain = table('plain_new', {id: int()})
    const Partial = table('partial_new', {code: int(), s: text()}, t => ({
      vip: uniqueIndex()
        .on(t.code)
        .where(sql`${t.s} = 'vip'`)
    }))
    await run('drop table if exists plain_new, partial_new')
    try {
      test.equal(
        await fails(() => push(db, Plain, Partial)),
        `MySQL indexes don't support where, see "vip"`
      )
      test.equal(
        await all(
          `select table_name from information_schema.tables where table_schema = database() and table_name in ('plain_new', 'partial_new')`
        ),
        []
      )
    } finally {
      await run('drop table if exists plain_new, partial_new')
    }
  })

  test('push refuses text types that are too small', async () => {
    const T = table('narrow_t', {v: tinytext()})
    await run('drop table if exists narrow_t')
    await run('create table narrow_t (v varchar(1000))')
    await run(`insert into narrow_t values (repeat('x', 300))`)
    try {
      test.equal(
        (await fails(() => push(db, T))).startsWith(
          'Push would change column "v" from varchar(1000) to tinytext'
        ),
        true
      )
      test.equal(await all('select length(v) as size from narrow_t'), [
        {size: 300}
      ])
    } finally {
      await run('drop table if exists narrow_t')
    }
  })
}

if (!isDeno && testMysql) {
  const {mysql2: connect} = await import('#/driver.ts')
  const {default: mysql2} = await import('mysql2')
  const client = mysql2.createConnection(
    'mysql://root:mysql@localhost:3306/mysql'
  )
  const db = connect(client)
  testCases(
    db,
    test,
    {
      push,
      inspect: (db, table) =>
        inspect(
          db,
          getTable(table).name,
          getTable(table).schemaName ?? 'mysql'
        ),
      drop: name => `drop table if exists \`${name}\``
    },
    cases
  )
  testRegressions(db)
  test('close', async () => {
    await db.close()
  })
}
