import {suite} from '@alinea/suite'
import {type AsyncDatabase, type Sql, getTable, sql} from '#/index.ts'
import {
  bigint,
  boolean,
  bytea,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgSchema,
  pgTable as table,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from '#/postgres.ts'
import {push} from '#/postgres/push.ts'
import {shape} from '#/postgres/shape.ts'
import {isDeno, testServers} from '../TestRuntime.ts'
import {failure, fixture} from '../TestUtils.ts'
import {type Case, testCases} from './TestCases.ts'

const test = suite(import.meta)

// Ported from sqldef (MIT): cmd/psqldef/tests_tables.yml, tests_indices.yml
// and tests_constraints.yml
const users = table('users', {
  id: bigint().notNull(),
  name: text(),
  age: integer()
})

const pkUsers = table('users', {id: bigint().primaryKey()})
const posts = (user = pkUsers.id) =>
  table('posts', {
    content: text(),
    userId: bigint('user_id').references(user)
  })
const plainPosts = table('posts', {
  content: text(),
  userId: bigint('user_id')
})

const test1 = pgSchema('test')
const pushMood = pgEnum('push_mood', ['happy', 'sad'])

const cases: Record<string, Case> = {
  // tests_tables.yml
  CreateTable: {
    desired: [users, table('bigdata', {data: bigint()})]
  },
  DropTable: {
    current: `
      create table users (id bigint not null, name text, age integer);
      create table bigdata (data bigint);
      insert into users values (1, 'a', 2);
    `,
    desired: [users],
    keep: {users: ['id', 'name', 'age']}
  },
  CreateTableAlterColumn: {
    current: `
      create table users (id bigint not null, name text);
      insert into users values (1, 'ada');
    `,
    desired: [
      table('users', {
        id: bigint().notNull(),
        name: varchar({length: 40})
      })
    ],
    options: {force: true},
    keep: {users: ['id', 'name']}
  },
  CreateTableAddColumn: {
    current: `
      create table users (id bigint not null, name text);
      insert into users values (1, 'ada');
    `,
    desired: [users],
    keep: {users: ['id', 'name']}
  },
  CreateTableDropColumn: {
    current: `
      create table users (id bigint not null, name text, age integer);
      insert into users values (1, 'ada', 3);
    `,
    desired: [table('users', {id: bigint().notNull(), age: integer()})],
    options: {force: true},
    keep: {users: ['id', 'age']}
  },
  CreateTableInNonPublicSchema: {
    current: `create schema if not exists test`,
    desired: [test1.table('users', {id: serial().primaryKey()})]
  },
  SameTableNameAcrossSchemas: {
    current: `
      create schema if not exists test;
      create table dummy (id int);
      insert into dummy values (1);
    `,
    desired: [
      table('dummy', {id: integer()}),
      test1.table('dummy', {id: integer()})
    ],
    keep: {dummy: ['id']}
  },
  ColumnNamedKeyIdempotent: {
    current: `
      create table users (
        id bigint not null, key text not null, primary key (id, key)
      );
      insert into users values (1, 'k');
    `,
    desired: [
      table('users', {id: bigint().notNull(), key: text().notNull()}, t => ({
        users_pkey: primaryKey(t.id, t.key)
      }))
    ],
    keep: {users: ['id', 'key']}
  },
  ColumnNamedCommentWithIdentityPrimaryKey: {
    current: `
      create table posts (
        id bigint generated always as identity primary key, comment text
      );
      insert into posts (comment) values ('c');
    `,
    desired: [
      table('posts', {
        id: bigint().generatedAlwaysAsIdentity().primaryKey(),
        comment: text()
      })
    ],
    keep: {posts: ['id', 'comment']}
  },
  ColumnNamedCommentInIndex: {
    current: `
      create table posts (id bigint not null, comment text not null);
      insert into posts values (1, 'c');
    `,
    desired: [
      table(
        'posts',
        {id: bigint().notNull(), comment: text().notNull()},
        t => ({idx_posts_comment: index().on(t.id, t.comment)})
      )
    ],
    keep: {posts: ['id', 'comment']}
  },
  ColumnNamedCommentInPartialIndex: {
    current: `create table posts (id bigint not null, comment text)`,
    desired: [
      table('posts', {id: bigint().notNull(), comment: text()}, t => ({
        idx_posts_comment_present: index()
          .on(t.id)
          .where(sql`${t.comment} is not null`)
      }))
    ]
  },
  AddColumnWithStringConcatDefault: {
    current: `create table t (); insert into t default values`,
    desired: [
      table('t', {
        s: varchar({length: 64})
          .notNull()
          .default(sql`'a' || 'b'`)
      })
    ]
  },
  ColumnTypesNamedByTheirAliases: {
    current: `
      create table t (
        a int4, b int8, c float8, d float4, e int2, f bool, g timestamptz
      );
      insert into t values (1, 2, 3, 4, 5, true, now());
    `,
    desired: [
      table('t', {
        a: integer(),
        b: bigint(),
        c: doublePrecision(),
        d: real(),
        e: smallint(),
        f: boolean(),
        g: timestamp({withTimeZone: true})
      })
    ],
    keep: {t: ['a', 'b', 'c', 'd', 'e', 'f']}
  },
  ColumnNamedLikeValueKeyword: {
    current: `create table t (id integer); insert into t values (1)`,
    desired: [
      table('t', {
        id: integer(),
        user: text('user'),
        currentDate: date('current_date')
      })
    ],
    keep: {t: ['id']}
  },

  // drizzle-kit/tests/push/pg.test.ts (Apache-2.0)
  DropIdentityFromColumn: {
    current: `
      create table users (id integer generated by default as identity);
      insert into users default values;
    `,
    desired: [table('users', {id: integer().notNull()})],
    keep: {users: ['id']}
  },
  AlterIdentityByDefaultToAlways: {
    current: `
      create table users (id integer generated by default as identity);
      insert into users default values;
    `,
    desired: [table('users', {id: integer().generatedAlwaysAsIdentity()})],
    keep: {users: ['id']}
  },
  AddIdentityToColumn: {
    current: `
      create table users (id integer primary key);
      insert into users values (1);
    `,
    desired: [
      table('users', {
        id: integer().generatedByDefaultAsIdentity().primaryKey()
      })
    ],
    keep: {users: ['id']},
    after: `insert into users default values`
  },
  AddColumnWithIdentity: {
    current: `create table users (name text); insert into users values ('a')`,
    desired: [
      table('users', {
        name: text(),
        id: integer().generatedAlwaysAsIdentity()
      })
    ],
    keep: {users: ['name']}
  },
  AddEnumColumn: {
    current: `
      drop type if exists push_mood;
      create table users (id integer);
      insert into users values (1);
    `,
    desired: [table('users', {id: integer(), mood: pushMood()})],
    keep: {users: ['id']}
  },

  // tests_indices.yml
  IndexesOnExpressions: {
    current: `create table users (id bigint not null, name text)`,
    desired: [
      table('users', {id: bigint().notNull(), name: text()}, t => ({
        users_lower_name: index().on(sql`lower(${t.name})`),
        users_expr: uniqueIndex().on(t.id, sql`(${t.id} + 1)`)
      }))
    ]
  },
  IndexWithUsing: {
    current: `
      create table users (id bigint not null, name text);
      create index users_name on users (name);
    `,
    desired: [
      table('users', {id: bigint().notNull(), name: text()}, t => ({
        users_name: index()
          .using(sql`hash`)
          .on(t.name)
      }))
    ]
  },
  RenameIndex: {
    current: `
      create table users (id bigint not null, email varchar(255));
      create index old_email_idx on users (email);
    `,
    desired: [
      table(
        'users',
        {id: bigint().notNull(), email: varchar({length: 255})},
        t => ({new_email_idx: index().on(t.email)})
      )
    ]
  },
  RenameMultipleIndexes: {
    current: `
      create table users (
        id bigint not null, email varchar(255), username varchar(100)
      );
      create index idx_email on users (email);
      create index idx_username on users (username);
    `,
    desired: [
      table(
        'users',
        {
          id: bigint().notNull(),
          email: varchar({length: 255}),
          username: varchar({length: 100})
        },
        t => ({
          email_idx: index().on(t.email),
          username_idx: index().on(t.username)
        })
      )
    ]
  },
  PartialIndexWithWhereIn: {
    current: `
      create table orders (id integer, status text);
      insert into orders values (1, 'active');
    `,
    desired: [
      table('orders', {id: integer(), status: text()}, t => ({
        idx_active: index()
          .on(t.id)
          .where(sql`${t.status} in ('active', 'pending')`)
      }))
    ],
    keep: {orders: ['id', 'status']}
  },
  PartialIndexWithWhereNotIn: {
    current: `create table orders (id integer, status text)`,
    desired: [
      table('orders', {id: integer(), status: text()}, t => ({
        idx_non_cancelled: index()
          .on(t.id)
          .where(sql`${t.status} not in ('cancelled', 'deleted')`)
      }))
    ]
  },
  IndexWithNullsOrdering: {
    desired: [
      table('t', {a: integer()}, t => ({
        t_a: index().on(t.a).desc().nullsLast()
      }))
    ]
  },
  ChangeNullsOrderingOfIndex: {
    current: `
      create table t (a integer);
      create index t_a on t (a nulls first);
    `,
    desired: [
      table('t', {a: integer()}, t => ({
        t_a: index().on(t.a).nullsLast()
      }))
    ]
  },
  ExplicitDefaultNullsOrderingIsNotAChange: {
    current: `
      create table t (a integer);
      create index t_a on t (a asc nulls last);
    `,
    desired: [table('t', {a: integer()}, t => ({t_a: index().on(t.a)}))]
  },
  CreateIndexOnColumnNamedTrigger: {
    desired: [
      table('t', {trigger: text()}, t => ({
        t_trigger: index().on(t.trigger)
      }))
    ]
  },
  CreatePartialIndexOnQuotedColumns: {
    current: `create table "Users" ("Id" int, "Name" text)`,
    desired: [
      table('Users', {Id: integer(), Name: text()}, t => ({
        users_name: index()
          .on(t.Name)
          .where(sql`${t.Id} > 0`)
      }))
    ]
  },
  IndexAndForeignOrder: {
    desired: [
      table('users', {id: bigint().primaryKey(), name: text()}, t => ({
        users_name: index().on(t.name)
      })),
      posts()
    ]
  },
  CreateIndexConcurrently: {
    current: `create table users (id bigint, name text)`,
    desired: [
      table('users', {id: bigint(), name: text()}, t => ({
        users_name: index().concurrently().on(t.name)
      }))
    ],
    skip: 'concurrent indexes cannot be created inside a transaction'
  },

  // tests_constraints.yml
  DropPrimaryKey: {
    current: `
      create table users (id bigint not null primary key, name text);
      insert into users values (1, 'a');
    `,
    desired: [table('users', {id: bigint().notNull(), name: text()})],
    keep: {users: ['id', 'name']}
  },
  CompositeForeignKeyConstraint: {
    current: `
      create table t1 (id1 int not null, id2 int not null, primary key (id1, id2));
      create table t2 (id1 int not null, id2 int not null, primary key (id1, id2));
    `,
    desired: (() => {
      const t1 = table(
        't1',
        {id1: integer().notNull(), id2: integer().notNull()},
        t => ({t1_pkey: primaryKey(t.id1, t.id2)})
      )
      const t2 = table(
        't2',
        {id1: integer().notNull(), id2: integer().notNull()},
        t => ({
          t2_pkey: primaryKey(t.id1, t.id2),
          fk: foreignKey(t.id1, t.id2).references(t1.id1, t1.id2)
        })
      )
      return [t1, t2]
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
      pkUsers,
      table('posts', {
        content: text(),
        userId: bigint('user_id').references(pkUsers.id, {
          onDelete: 'set null',
          onUpdate: 'cascade'
        })
      })
    ],
    keep: {posts: ['content', 'user_id']}
  },
  AddDifferentForeignKeyWithSameName: {
    current: `
      create table users (id bigint primary key);
      create table posts (content text, user_id bigint);
      alter table only public.posts add constraint posts_ibfk_1
        foreign key (user_id) references users (id)
        on delete set null on update cascade;
    `,
    desired: [
      pkUsers,
      table('posts', {
        content: text(),
        userId: bigint('user_id').references(pkUsers.id, {
          onUpdate: 'cascade'
        })
      })
    ]
  },
  CreateTableAddAbsentForeignKey: {
    current: `
      create table users (id int primary key);
      create table posts (content text, user_id int);
    `,
    desired: (() => {
      const u = table('users', {id: integer().primaryKey()})
      return [
        u,
        table('posts', {
          content: text(),
          userId: integer('user_id').references(u.id)
        })
      ]
    })()
  },
  ConstraintUniqueAdd: {
    current: `
      create table products (id serial, sku text);
      insert into products (sku) values ('a');
    `,
    desired: [
      table('products', {id: serial(), sku: text()}, t => ({
        products_sku_key: unique().on(t.sku)
      }))
    ],
    keep: {products: ['id', 'sku']}
  },
  ConstraintUniqueRemove: {
    current: `create table products (id serial, sku text, unique (sku))`,
    desired: [table('products', {id: serial(), sku: text()})]
  },
  ConstraintUniqueNullsNotDistinctAdd: {
    current: `create table products (a integer, b integer)`,
    desired: [
      table('products', {a: integer(), b: integer()}, t => ({
        products_a_b_key: unique().on(t.a, t.b).nullsNotDistinct()
      }))
    ]
  },
  UnnamedCompositeUniqueConstraints: {
    desired: [
      table('t2', {a: integer(), b: integer()}, t => [unique().on(t.a, t.b)]),
      table('t3', {a: integer(), c: integer()}, t => [unique().on(t.a, t.c)])
    ]
  },
  DropPrimaryKeyAndColumn: {
    current: `
      create table users (id bigint not null primary key, name text);
      insert into users values (1, 'a');
    `,
    desired: [table('users', {name: text()})],
    options: {force: true},
    keep: {users: ['name']}
  },
  AddPrimaryKeyAndColumnBack: {
    current: `create table users (name text)`,
    desired: [
      table('users', {id: bigint().notNull().primaryKey(), name: text()})
    ]
  },
  ConstraintPrimaryKey: {
    desired: [
      table('users', {a: integer(), b: integer()}, t => ({
        a_b_pkey: primaryKey(t.a, t.b)
      }))
    ]
  },
  ModifyForeignKeyActions: {
    current: `
      create table users (id bigint primary key);
      create table posts (
        content text, user_id bigint,
        constraint posts_ibfk_1 foreign key (user_id) references users (id)
      );
    `,
    desired: [
      pkUsers,
      table('posts', {
        content: text(),
        userId: bigint('user_id').references(pkUsers.id, {
          onDelete: 'set null',
          onUpdate: 'cascade'
        })
      })
    ]
  },
  RemoveForeignKeyConstraint: {
    current: `
      create table users (id bigint primary key);
      create table posts (
        content text, user_id bigint,
        constraint posts_ibfk_1 foreign key (user_id) references users (id)
          on delete set null on update cascade
      );
    `,
    desired: [pkUsers, plainPosts]
  },
  CreateTableWithReferences: {
    desired: (() => {
      const a = table('a', {
        aId: integer('a_id').primaryKey(),
        myText: text('my_text').unique().notNull()
      })
      const b = table('b', {
        bId: integer('b_id').primaryKey(),
        aId: integer('a_id').references(a.aId),
        aMyText: text('a_my_text').notNull().references(a.myText)
      })
      return [a, b]
    })()
  },
  DropReferences: {
    current: `
      create table a (a_id integer primary key, my_text text unique not null);
      create table b (
        b_id integer primary key,
        a_id integer references a,
        a_my_text text not null references a (my_text)
      );
      insert into a values (1, 'x');
      insert into b values (1, 1, 'x');
    `,
    desired: [
      table('a', {
        aId: integer('a_id').primaryKey(),
        myText: text('my_text').unique().notNull()
      }),
      table('b', {
        bId: integer('b_id').primaryKey(),
        aId: integer('a_id'),
        aMyText: text('a_my_text').notNull()
      })
    ],
    keep: {b: ['b_id', 'a_id', 'a_my_text']}
  },
  ReferencesWithOnDeleteCascade: {
    desired: (() => {
      const customers = table('customers', {
        id: uuid().notNull().primaryKey(),
        customerName: varchar('customer_name', {length: 255}).notNull()
      })
      return [
        customers,
        table('orders', {
          id: uuid().notNull().primaryKey(),
          orderNumber: varchar('order_number', {length: 255}).notNull(),
          customer: uuid().references(customers.id, {onDelete: 'cascade'})
        })
      ]
    })()
  },
  AddUniqueConstraint: {
    current: `
      create table dummy (
        column_a int not null, column_b int not null, column_c int not null
      );
      insert into dummy values (1, 2, 3);
    `,
    desired: [
      table(
        'dummy',
        {
          a: integer('column_a').notNull(),
          b: integer('column_b').notNull(),
          c: integer('column_c').notNull()
        },
        t => ({dummy_uniq: unique().on(t.a, t.b)})
      )
    ],
    keep: {dummy: ['column_a', 'column_b', 'column_c']}
  },
  DropUniqueConstraint: {
    current: `
      create table dummy (
        column_a int not null, column_b int not null, column_c int not null
      );
      alter table dummy add constraint dummy_uniq unique (column_a, column_b);
    `,
    desired: [
      table('dummy', {
        a: integer('column_a').notNull(),
        b: integer('column_b').notNull(),
        c: integer('column_c').notNull()
      })
    ]
  },
  AddUniqueConstraintInNonPublicSchema: {
    current: `
      create schema if not exists test;
      create table test.dummy (a int, b int);
    `,
    desired: [
      test1.table('dummy', {a: integer(), b: integer()}, t => ({
        a_b_uniq: unique().on(t.a, t.b)
      }))
    ]
  },
  DropUnnamedForeignKey: {
    current: `
      create table users (id bigint not null primary key);
      create table posts (
        id bigint not null primary key, user_id bigint,
        foreign key (user_id) references users (id)
      );
    `,
    desired: [
      table('users', {id: bigint().notNull().primaryKey()}),
      table('posts', {
        id: bigint().notNull().primaryKey(),
        userId: bigint('user_id')
      })
    ]
  },
  ModifyUnnamedForeignKey: {
    current: `
      create table users (id bigint not null primary key);
      create table admins (id bigint not null primary key);
      create table posts (
        id bigint not null primary key, author_id bigint,
        foreign key (author_id) references users (id)
      );
    `,
    desired: (() => {
      const admins = table('admins', {id: bigint().notNull().primaryKey()})
      return [
        table('users', {id: bigint().notNull().primaryKey()}),
        admins,
        table('posts', {
          id: bigint().notNull().primaryKey(),
          authorId: bigint('author_id').references(admins.id)
        })
      ]
    })()
  },
  CompositeUnnamedForeignKey: {
    desired: (() => {
      const u = table(
        'users',
        {
          tenantId: bigint('tenant_id').notNull(),
          userId: bigint('user_id').notNull(),
          name: varchar({length: 255}).notNull()
        },
        t => [primaryKey(t.tenantId, t.userId)]
      )
      return [
        u,
        table(
          'posts',
          {
            id: bigint().notNull().primaryKey(),
            tenantId: bigint('tenant_id').notNull(),
            authorId: bigint('author_id').notNull()
          },
          t => [
            foreignKey(t.tenantId, t.authorId).references(u.tenantId, u.userId)
          ]
        )
      ]
    })()
  },
  ChangeForeignKeyOnDeleteOption: {
    current: `
      create table users (id bigint primary key);
      create table posts (id bigint primary key, user_id bigint);
      alter table posts add constraint posts_user_fk
        foreign key (user_id) references users (id) on delete restrict;
    `,
    desired: [
      pkUsers,
      table('posts', {
        id: bigint().primaryKey(),
        userId: bigint('user_id').references(pkUsers.id, {
          onDelete: 'cascade'
        })
      })
    ]
  },
  AddUnnamedForeignKey: {
    current: `
      create table p (id bigint primary key);
      create table c (p_id bigint);
      insert into p values (1);
      insert into c values (1);
    `,
    desired: (() => {
      const p = table('p', {id: bigint().primaryKey()})
      return [p, table('c', {pId: bigint('p_id').references(p.id)})]
    })(),
    keep: {c: ['p_id']}
  },
  UnnamedForeignKeyReferenceChanged: {
    current: `
      create table p (id int primary key);
      create table q (id int primary key);
      create table c (p_id int, foreign key (p_id) references p (id));
    `,
    desired: (() => {
      const q = table('q', {id: integer().primaryKey()})
      return [
        table('p', {id: integer().primaryKey()}),
        q,
        table('c', {pId: integer('p_id').references(q.id)})
      ]
    })()
  },
  // The unique key is kept, its name moves out of the new index's way
  IndexTakesKeyName: {
    current: `
      create table users (a int, b int, constraint users_x unique (b));
      insert into users values (1, 2);
    `,
    desired: [
      table('users', {a: integer(), b: integer().unique()}, t => ({
        users_x: index().on(t.a)
      }))
    ],
    keep: {users: ['a', 'b']}
  },
  // Keys matched by their columns keep their names, swapped or not
  SwapKeyNames: {
    current: `
      create table users (
        a int, b int,
        constraint users_k1 unique (a), constraint users_k2 unique (b)
      );
    `,
    desired: [
      table('users', {a: integer(), b: integer()}, t => [
        unique('users_k2').on(t.a),
        unique('users_k1').on(t.b)
      ])
    ]
  },
  ChainKeyNames: {
    current: `
      create table users (
        a int, b int,
        constraint users_k1 unique (a), constraint users_k2 unique (b)
      );
    `,
    desired: [
      table('users', {a: integer(), b: integer()}, t => [
        unique('users_k2').on(t.a),
        unique('users_k3').on(t.b)
      ])
    ]
  },
  // A new index takes the name of a key that moves onto a name still held
  IndexTakesHeldKeyName: {
    current: `
      create table users (
        a int, b int, c int,
        constraint users_k1 unique (a), constraint users_k2 unique (b)
      );
    `,
    desired: [
      table('users', {a: integer(), b: integer(), c: integer()}, t => ({
        users_k2: unique('users_k2').on(t.a),
        users_k3: unique('users_k3').on(t.b),
        users_k1: index().on(t.c)
      }))
    ]
  },
  // A kept foreign key moves out of the way of a new one with its name
  ForeignKeyTakesKeptName: {
    current: `
      create table p (id int primary key);
      create table t (
        id int primary key, a int, b int,
        constraint t_f0 foreign key (a) references t (id)
      );
    `,
    desired: (() => {
      const p = table('p', {id: integer().primaryKey()})
      const t = table(
        't',
        {id: integer().primaryKey(), a: integer(), b: integer()},
        t => ({
          t_f0: foreignKey(t.b).references(p.id),
          t_f1: foreignKey(t.a).references(t.id)
        })
      )
      return [p, t]
    })()
  },
  // Foreign keys over a column that changes type are dropped and re-added
  RetypeSelfReference: {
    current: `
      create table tree (
        id int primary key, parent int,
        foreign key (parent) references tree (id)
      );
    `,
    desired: (() => {
      const tree = table(
        'tree',
        {id: text().primaryKey(), parent: text()},
        t => [foreignKey(t.parent).references(t.id)]
      )
      return [tree]
    })()
  },
  RetypeReferencedKey: {
    current: `
      create table p (id int primary key);
      create table c (p_id int references p (id));
    `,
    desired: (() => {
      const p = table('p', {id: text().primaryKey()})
      return [p, table('c', {pId: text('p_id').references(p.id)})]
    })()
  },
  // Postgres has no cast from integer to date, only through text
  IntegerToDate: {
    current: 'create table users (day integer)',
    desired: [table('users', {day: date()})]
  },
  // The cast to a new enum is checked once the enum exists
  IntegerToNewEnum: {
    current: `
      drop type if exists push_mood;
      create table users (mood integer);
    `,
    desired: [table('users', {mood: pushMood()})]
  },
  IntegerToDateWithNulls: {
    current: `
      create table users (id int, day integer);
      insert into users values (1, null);
    `,
    desired: [table('users', {id: integer(), day: date()})],
    keep: {users: ['id']}
  }
}

const review = pgSchema('review')

function testRegressions(db: AsyncDatabase<'postgres'>) {
  const run = (query: string) => db.run(sql.unsafe(query))
  const all = (query: string) => db.all(sql.unsafe(query) as Sql<object>)
  const reset = async () => {
    await run('create schema if not exists review')
    for (const name of [
      'review.review_t',
      'public.review_t',
      'review.review_d',
      'public.review_d',
      'fk_child',
      'review.fk_parent',
      'public.fk_parent'
    ])
      await run(`drop table if exists ${name} cascade`)
  }

  test('defaults of bytes, bigints and dates', async () => {
    const Defaults = table('review_d', {
      id: integer(),
      bytes: bytea().default(new Uint8Array([4])),
      big: bigint().default(2n),
      day: date({mode: 'date'}).default(new Date(0)),
      at: timestamp().default(new Date(0))
    })
    await fixture(reset, async () => {
      await push(db, {Defaults})
      test.equal(await push.plan(db, {Defaults}), [])
      await db.insert(Defaults).values({id: 1})
      const [row] = await db.select().from(Defaults)
      test.equal(
        {...row, bytes: new Uint8Array(row.bytes!)},
        {
          id: 1,
          bytes: new Uint8Array([4]),
          big: 2n,
          day: new Date(0),
          at: new Date(0)
        }
      )
    })
  })

  test('push creates indexes in the table schema', async () => {
    const T = review.table('review_t', {v: integer()}, t => ({
      review_t_v: index().on(t.v)
    }))
    await fixture(reset, async () => {
      await run('create table public.review_t (v int)')
      await run('create table review.review_t (v int)')
      await push(db, {T})
      test.equal(
        await all(
          `select schemaname as schema from pg_indexes where indexname = 'review_t_v'`
        ),
        [{schema: 'review'}]
      )
      test.equal(await push.plan(db, {T}), [])
    })
  })

  test('foreign keys across schemas', async () => {
    const PublicParent = table('fk_parent', {id: integer().primaryKey()})
    const ReviewParent = review.table('fk_parent', {id: integer().primaryKey()})
    const Child = table('fk_child', {
      parent: integer().references(ReviewParent.id)
    })
    await fixture(reset, async () => {
      await run('create table public.fk_parent (id int primary key)')
      await run('create table review.fk_parent (id int primary key)')
      await run(
        'create table fk_child (parent int references public.fk_parent)'
      )
      await push(db, {Child, PublicParent, ReviewParent})
      test.equal(
        await all(
          `select confrelid::regclass::text as target from pg_constraint where conrelid = 'fk_child'::regclass and contype = 'f'`
        ),
        [{target: 'review.fk_parent'}]
      )
      test.equal(await push.plan(db, {PublicParent, ReviewParent, Child}), [])
    })
  })

  test('qualified looking defaults', async () => {
    const D = review.table('review_d', {
      id: integer(),
      s: text().default('review.hello')
    })
    await fixture(reset, async () => {
      await push(db, {D})
      test.equal(await push.plan(db, {D}), [])
      await run('insert into review.review_d (id) values (1)')
      test.equal(await all('select s from review.review_d'), [
        {s: 'review.hello'}
      ])
    })
  })

  test('push compares timestamp precision', async () => {
    const Coarse = table('ts_t', {at: timestamp({precision: 3})})
    const Fine = table('ts_t', {at: timestamp({precision: 6})})
    await run('drop table if exists ts_t')
    await run('create table ts_t (at timestamp(3))')
    await run(`insert into ts_t values ('2026-01-02 03:04:05.678')`)
    try {
      await push(db, {Fine})
      test.equal(await push.plan(db, {Fine}), [])
      await run(`update ts_t set at = '2026-01-02 03:04:05.678901'`)
      const error = await failure(() => push(db, {Coarse}))
      test.equal(error.startsWith('Push would change column "at"'), true)
      test.equal(await all(`select to_char(at, 'US') as us from ts_t`), [
        {us: '678901'}
      ])
    } finally {
      await run('drop table if exists ts_t')
    }
  })

  test('plan leaves sequences alone', async () => {
    const T = table('seq_t', {
      id: integer(),
      n: integer().default(sql`nextval('push_seq')`)
    })
    await run('drop table if exists seq_t')
    await run('drop sequence if exists push_seq')
    await run('create sequence push_seq')
    await run('create table seq_t (id int)')
    await run('insert into seq_t values (1)')
    try {
      test.equal((await push.plan(db, {T})).length, 1)
      test.equal(await all(`select nextval('push_seq')::int as n`), [{n: 1}])
    } finally {
      await run('drop table if exists seq_t')
      await run('drop sequence if exists push_seq')
    }
  })

  test('plan leaves sequences behind functions alone', async () => {
    const T = table('ticket_t', {
      id: integer(),
      n: integer().default(sql`ticket()`)
    })
    await run('drop table if exists ticket_t')
    await run('drop function if exists ticket')
    await run('drop sequence if exists ticket_seq')
    await run('create sequence ticket_seq')
    await run(
      `create function ticket() returns int language sql as 'select nextval(''ticket_seq'')::int'`
    )
    await run('create table ticket_t (id int)')
    await run('insert into ticket_t values (1)')
    try {
      test.equal((await push.plan(db, {T})).length, 1)
      test.equal(await all(`select nextval('ticket_seq')::int as n`), [{n: 1}])
    } finally {
      await run('drop table if exists ticket_t')
      await run('drop function if exists ticket')
      await run('drop sequence if exists ticket_seq')
    }
  })

  test('push refuses fewer integer digits', async () => {
    const T = table('decimal_t', {n: numeric({precision: 8, scale: 4})})
    await run('drop table if exists decimal_t')
    await run('create table decimal_t (n numeric(8, 2))')
    await run('insert into decimal_t values (123456.78)')
    try {
      const error = await failure(() => push(db, {T}))
      test.equal(
        error.startsWith(
          'Push would change column "n" from numeric(8,2) to numeric(8,4)'
        ),
        true
      )
      test.equal(await all('select n::text as n from decimal_t'), [
        {n: '123456.78'}
      ])
    } finally {
      await run('drop table if exists decimal_t')
    }
  })

  test('alter the resolved table', async () => {
    const T = table('shadow_t', {id: integer()})
    await run('drop table if exists pg_temp.shadow_t')
    await run('drop table if exists public.shadow_t')
    await run('create table public.shadow_t (id int, notes text)')
    await run('create temporary table shadow_t (id int, notes text)')
    await run(`insert into pg_temp.shadow_t values (1, 'keep')`)
    try {
      await push(db, {T})
      test.equal(
        await all(
          `select column_name as name from information_schema.columns where table_schema = 'public' and table_name = 'shadow_t' order by ordinal_position`
        ),
        [{name: 'id'}]
      )
      test.equal(await all('select id, notes from pg_temp.shadow_t'), [
        {id: 1, notes: 'keep'}
      ])
    } finally {
      await run('drop table if exists pg_temp.shadow_t')
      await run('drop table if exists public.shadow_t')
    }
  })

  test('retype a column with a default', async () => {
    const T = table('retype_t', {n: integer().default(1)})
    await run('drop table if exists retype_t')
    await run(`create table retype_t (n text default '1')`)
    await run(`insert into retype_t values ('2')`)
    try {
      await push(db, {T}, {force: true})
      await run('insert into retype_t default values')
      test.equal(await all('select n from retype_t order by n'), [
        {n: 1},
        {n: 2}
      ])
      test.equal(await push.plan(db, {T}), [])
    } finally {
      await run('drop table if exists retype_t')
    }
  })

  test('nullable column to identity', async () => {
    const T = table('ident_t', {id: integer().generatedByDefaultAsIdentity()})
    for (const [rows, next] of [
      ['(1), (2)', 3],
      ['(-1)', 1]
    ] as const) {
      await run('drop table if exists ident_t')
      await run('create table ident_t (id int)')
      await run(`insert into ident_t values ${rows}`)
      try {
        await push(db, {T})
        await run('insert into ident_t default values')
        test.equal(
          await all('select max(id) as id from ident_t where id > 0'),
          [{id: next}]
        )
      } finally {
        await run('drop table if exists ident_t')
      }
    }
  })

  test('row level security', async () => {
    const T = table('rls_t', {id: integer()})
    await run('drop table if exists rls_t')
    await run('drop role if exists push_rls')
    await run('create role push_rls')
    await run('grant create on database postgres to push_rls')
    await run('grant all on schema public to push_rls')
    try {
      await run('set role push_rls')
      await run('create table rls_t (id int, notes text)')
      await run('alter table rls_t enable row level security')
      await run('alter table rls_t force row level security')
      await run('create policy hidden on rls_t using (false)')
      await run('reset role')
      await run(`insert into rls_t values (1, 'x')`)
      await run('set role push_rls')
      const error = await failure(() => push(db, {T}))
      await run('reset role')
      test.equal(
        error,
        `Push can't check the rows of "rls_t" behind row level security, pass force`
      )
      test.equal(await all('select id, notes from rls_t'), [
        {id: 1, notes: 'x'}
      ])
    } finally {
      await run('reset role')
      await run('drop table if exists rls_t')
      await run('revoke all on schema public from push_rls')
      await run('revoke create on database postgres from push_rls')
      await run('drop role if exists push_rls')
    }
  })

  test('reference the permanent table', async () => {
    const Parent = table('fkt_parent', {id: integer().primaryKey()})
    const Child = table('fkt_child', {pid: integer().references(Parent.id)})
    const target = () =>
      all(
        `select n.nspname as schema from pg_constraint c join pg_class r on r.oid = c.confrelid join pg_namespace n on n.oid = r.relnamespace where c.conrelid = 'public.fkt_child'::regclass and c.contype = 'f'`
      )
    await run('drop table if exists public.fkt_child, pg_temp.fkt_parent')
    await run('drop table if exists public.fkt_parent')
    await run('create table public.fkt_parent (id int primary key)')
    await run('create temporary table fkt_parent (id int primary key)')
    await run('create table public.fkt_child (pid int)')
    try {
      await push(db, {Parent, Child})
      test.equal(await target(), [{schema: 'public'}])
      await run('drop table public.fkt_child')
      await push(db, {Parent, Child})
      test.equal(await target(), [{schema: 'public'}])
    } finally {
      await run('drop table if exists public.fkt_child, pg_temp.fkt_parent')
      await run('drop table if exists public.fkt_parent')
    }
  })

  test('push removes an identity', async () => {
    const Nullable = table('unident_t', {id: integer()})
    const Defaulted = table('unident_t', {id: integer().default(5)})
    for (const [desired, inserted] of [
      [Nullable, 'insert into unident_t values (null)'],
      [Defaulted, 'insert into unident_t default values']
    ] as const) {
      await run('drop table if exists unident_t')
      await run(
        'create table unident_t (id int generated by default as identity)'
      )
      await run('insert into unident_t default values')
      try {
        await push(db, {desired})
        await run(inserted)
        test.equal(await all('select id from unident_t order by id'), [
          {id: 1},
          {id: desired === Nullable ? null : 5}
        ])
      } finally {
        await run('drop table if exists unident_t')
      }
    }
  })

  test('index the new table', async () => {
    const Users = table('dup_users', {email: text()}, t => ({
      dup_users_email: uniqueIndex().on(t.email)
    }))
    await run('drop table if exists pg_temp.dup_users')
    await run('drop table if exists public.dup_users')
    await run('create temporary table dup_users (email text)')
    try {
      await push(db, {Users})
      await run(`insert into public.dup_users values ('a')`)
      const error = await failure(() =>
        run(`insert into public.dup_users values ('a')`)
      )
      test.equal(error.includes('duplicate key'), true)
      test.equal(await all('select email from public.dup_users'), [
        {email: 'a'}
      ])
    } finally {
      await run('drop table if exists pg_temp.dup_users')
      await run('drop table if exists public.dup_users')
    }
  })

  test('move a referenced primary key', async () => {
    const Users = table('key_users', {
      id: integer().notNull(),
      account: integer().primaryKey()
    })
    const Posts = table('key_posts', {
      author: integer().references(Users.account)
    })
    const constraint = (name: string, type: string) =>
      all(
        `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = '${name}'::regclass and contype = '${type}'`
      )
    await run('drop table if exists key_posts, key_users')
    await run(
      'create table key_users (id int primary key, account int unique not null)'
    )
    await run('create table key_posts (author int references key_users (id))')
    await run('insert into key_users values (1, 1)')
    await run('insert into key_posts values (1)')
    try {
      const error = await failure(() => push(db, {Users}))
      test.equal(error.includes('depend'), true)
      test.equal(await constraint('key_users', 'p'), [
        {def: 'PRIMARY KEY (id)'}
      ])
      await push(db, {Users, Posts})
      test.equal(await constraint('key_users', 'p'), [
        {def: 'PRIMARY KEY (account)'}
      ])
      test.equal(await constraint('key_posts', 'f'), [
        {def: 'FOREIGN KEY (author) REFERENCES key_users(account)'}
      ])
      test.equal(await all('select author from key_posts'), [{author: 1}])
      test.equal(await push.plan(db, {Users, Posts}), [])
    } finally {
      await run('drop table if exists key_posts, key_users')
    }
  })

  test('push promotes a key column to serial', async () => {
    const Invoices = table('invoices', {id: serial().primaryKey()})
    await run('drop table if exists invoices')
    await run('create table invoices (id integer primary key)')
    await run('insert into invoices values (1), (5)')
    try {
      await push(db, {Invoices})
      await run('insert into invoices default values')
      test.equal(await all('select id from invoices order by id'), [
        {id: 1},
        {id: 5},
        {id: 6}
      ])
      test.equal(await push.plan(db, {Invoices}), [])
    } finally {
      await run('drop table if exists invoices')
    }
  })

  test('serial promotion', async () => {
    const Promoted = table('a_b', {id: serial().primaryKey()})
    const fails = (run: () => unknown) =>
      Promise.resolve()
        .then(run)
        .then(
          () => '',
          error => String(error.message)
        )
    await run('drop table if exists a, a_b')
    await run('create table a (b_id serial)')
    await run('insert into a default values')
    await run('create table a_b (id integer primary key)')
    await run('insert into a_b values (10)')
    try {
      test.equal((await fails(() => push.plan(db, {Promoted}))) !== '', true)
      test.equal((await fails(() => push(db, {Promoted}))) !== '', true)
      await run('insert into a default values')
      test.equal(await all('select b_id from a order by b_id'), [
        {b_id: 1},
        {b_id: 2}
      ])
    } finally {
      await run('drop table if exists a, a_b')
    }
  })

  test('push turns a serial into an identity', async () => {
    const T = table('serial_t', {
      id: integer().generatedByDefaultAsIdentity().primaryKey()
    })
    await run('drop table if exists serial_t')
    await run('create table serial_t (id serial primary key)')
    await run('insert into serial_t default values')
    await run('insert into serial_t default values')
    try {
      await push(db, {T})
      await run('insert into serial_t default values')
      test.equal(await all('select id from serial_t order by id'), [
        {id: 1},
        {id: 2},
        {id: 3}
      ])
      test.equal(await push.plan(db, {T}), [])
    } finally {
      await run('drop table if exists serial_t')
    }
  })

  test('existing rado_push schema', async () => {
    const T = table('fk_child', {parent: integer(), extra: text()})
    await reset()
    await run('create schema if not exists rado_push')
    await run('create table if not exists rado_push.keep (v int)')
    await run('insert into rado_push.keep values (1)')
    await run('create table fk_child (parent int)')
    try {
      await push(db, {T})
      test.equal(await push.plan(db, {T}), [])
      test.equal(await all('select v from rado_push.keep'), [{v: 1}])
    } finally {
      await run('drop schema rado_push cascade')
      await reset()
    }
  })
}

// A writer that holds rows the push would drop must finish before the push
// checks for data
function testLock(
  db: AsyncDatabase<'postgres'>,
  connect: () => Promise<{
    query(text: string): Promise<unknown>
    end(): Promise<void>
  }>
) {
  test('push reads the table after taking the lock', async () => {
    const T = table('relock_t', {id: integer(), extra: text()})
    await db.run(sql`drop table if exists relock_t`)
    await db.run(sql`create table relock_t (id int)`)
    const other = await connect()
    try {
      await other.query('begin')
      await other.query('alter table relock_t add column extra text')
      const pushing = failure(() => push(db, {T}))
      await new Promise(resolve => setTimeout(resolve, 300))
      await other.query('commit')
      test.equal(await pushing, '')
      test.equal(
        await db.all(
          sql<object>`select column_name as name from information_schema.columns where table_name = 'relock_t' order by ordinal_position`
        ),
        [{name: 'id'}, {name: 'extra'}]
      )
    } finally {
      await other.end()
      await db.run(sql`drop table if exists relock_t`)
    }
  })

  test('push waits for writers before checking data', async () => {
    const L = table('lock_t', {id: integer()})
    await db.run(sql`drop table if exists lock_t`)
    await db.run(sql`create table lock_t (id int, v text)`)
    await db.run(sql`insert into lock_t values (1, null)`)
    const other = await connect()
    try {
      await other.query('begin')
      await other.query(`insert into lock_t values (2, 'x')`)
      const pushing = failure(() => push(db, {L}))
      await new Promise(resolve => setTimeout(resolve, 300))
      await other.query('commit')
      test.equal(
        (await pushing).startsWith('Push would drop column "v" with data'),
        true
      )
      test.equal(
        await db.all(sql<object>`select v from lock_t where v is not null`),
        [{v: 'x'}]
      )
    } finally {
      await other.end()
      await db.run(sql`drop table if exists lock_t`)
    }
  })
}

if (!isDeno) {
  const db = testServers
    ? await (async () => {
        const {pg: connect} = await import('#/driver.ts')
        const {default: pg} = await import('pg')
        const client = new pg.Client({
          connectionString:
            'postgres://postgres:postgres@localhost:5432/postgres'
        })
        await client.connect()
        const db = connect(client)
        testLock(db, async () => {
          const other = new pg.Client({
            connectionString:
              'postgres://postgres:postgres@localhost:5432/postgres'
          })
          await other.connect()
          return other
        })
        return db
      })()
    : await (async () => {
        const {'@electric-sql/pglite': connect} = await import('#/driver.ts')
        const {PGlite} = await import('@electric-sql/pglite')
        return connect(new PGlite())
      })()
  testCases(
    db,
    test,
    {
      push,
      shape: (db, table) => {
        const api = getTable(table)
        return shape(db, api.name, api.schemaName ?? 'public')
      },
      drop: name =>
        `drop table if exists ${name
          .split('.')
          .map(part => `"${part}"`)
          .join('.')} cascade`
    },
    cases
  )
  testRegressions(db)
  test('close', async () => {
    await db.close()
  })
}
