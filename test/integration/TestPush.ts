import type {DefineTest} from '@alinea/suite'
import type {Async} from '#/core/MetaData.ts'
import {
  alias,
  type Database,
  inArray,
  sql,
  view,
  type Table,
  foreignKey,
  index,
  primaryKey,
  table,
  temporaryTable,
  unique
} from '#/index.ts'
import {push as postgresPush} from '#/postgres/push.ts'
import {push} from '#/push.ts'
import {push as sqlitePush} from '#/sqlite/push.ts'
import {id, integer, text, varchar} from '#/universal.ts'
import {failure, fixture} from '../TestUtils.ts'
import * as fixtures from './schema.ts'

// Initial table structure
const TableA = table(
  'Table',
  {
    id: id(),
    fieldA: varchar('fieldA', {length: 10}),
    removeMe: integer(),
    unchangedField: varchar('unchanged', {length: 20})
  },
  Table => {
    return {
      unique: unique().on(Table.fieldA),
      index: index().on(Table.removeMe),
      compositeIndex: index().on(Table.fieldA, Table.unchangedField)
    }
  }
)

// Modified table structure
const TableB = table(
  'Table',
  {
    id: id(),
    fieldB: varchar('fieldA', {length: 10}),
    extraColumn: varchar(undefined, {length: 10}),
    unchangedField: varchar('unchanged', {length: 20}),
    newRequiredField: varchar('newRequired', {length: 15})
      .notNull()
      .default('default')
  },
  Table => {
    return {
      unique2: unique().on(Table.fieldB),
      index: index().on(Table.fieldB, Table.extraColumn),
      unchangedIndex: index().on(Table.unchangedField)
    }
  }
)

// Another version for testing multiple pushes
const TableC = table(
  'Table',
  {
    id: id(),
    fieldB: varchar('fieldA', {length: 20}),
    extraColumn: varchar(undefined, {length: 15}),
    unchangedField: varchar('unchanged', {length: 20}),
    newRequiredField: varchar('newRequired', {length: 15})
  },
  Table => {
    return {
      unique2: unique().on(Table.fieldB, Table.extraColumn),
      newIndex: index().on(Table.newRequiredField)
    }
  }
)

// A postgres database can't be passed to the sqlite entry
export function typed(db: Database<Async<'postgres'>>): void {
  // @ts-expect-error
  void sqlitePush(db, {})
  void postgresPush(db, {})
  void push(db, {})
}

const RenamedParent = table('push_parent', {pid: integer().primaryKey()})
const RenamedChild = table('push_child', {
  id: integer().primaryKey(),
  parent: integer().references(RenamedParent.pid)
})

const CycleA = table('push_cycle_a', {
  id: integer().primaryKey(),
  b: integer().references((): any => CycleB.id)
})
const CycleB = table('push_cycle_b', {
  id: integer().primaryKey(),
  a: integer().references(CycleA.id)
})

const UserA = table('push_user', {
  id: id(),
  name: varchar(undefined, {length: 20}),
  bio: text()
})

const UserB = table('push_user', {
  id: id(),
  fullName: varchar('full_name', {length: 20})
})

const Author = table('push_author', {
  id: integer().primaryKey(),
  name: text()
})

const Post = table(
  'push_post',
  {
    id: integer().primaryKey(),
    author: integer().references(Author.id),
    editor: integer()
  },
  Post => ({
    editorFk: foreignKey(Post.editor).references(Author.id)
  })
)

async function rejects(
  test: DefineTest,
  run: () => Promise<unknown>,
  message = ''
) {
  const error = await run().then(
    () => undefined,
    error => error
  )
  test.equal(error instanceof Error && error.message.includes(message), true)
}

export function testPush(db: Database, test: DefineTest) {
  // MySQL can't guard drops against concurrent writers, so they need force
  const unchecked = {force: db.dialect.runtime === 'mysql'}
  const drop =
    (...tables: Array<Table>) =>
    async () => {
      for (const table of tables) await db.drop(table)
    }

  test('push does not make primary keys nullable', async () => {
    const ColumnPrimaryKeyUpload = table('alinea_upload_column_pk', {
      entryId: varchar(undefined, {length: 255}).primaryKey(),
      content: text().notNull()
    })
    const CompositePrimaryKeyUpload = table(
      'alinea_upload_composite_pk',
      {
        entryId: varchar(undefined, {length: 255}),
        locale: varchar(undefined, {length: 16}),
        content: text().notNull()
      },
      t => ({
        pk: primaryKey(t.entryId, t.locale)
      })
    )
    const tables = [ColumnPrimaryKeyUpload, CompositePrimaryKeyUpload]
    await fixture(drop(...tables), async () => {
      await push(db, {...tables})
      test.equal(await push.plan(db, {...tables}), [])
    })
  })

  test('push creates missing table', async () => {
    await fixture(drop(TableB), async () => {
      await push(db, {TableB}, unchecked)
      await db.insert(TableB).values({
        fieldB: 'created',
        unchangedField: 'test',
        newRequiredField: 'custom'
      })

      const node = await db.select().from(TableB).get()
      test.equal(node, {
        id: 1,
        fieldB: 'created',
        extraColumn: null,
        unchangedField: 'test',
        newRequiredField: 'custom'
      })

      await rejects(test, async () => {
        await db.insert(TableB).values({
          fieldB: 'created',
          unchangedField: 'duplicate',
          newRequiredField: 'custom'
        })
      })
      test.equal(await push.plan(db, {TableB}), [])
    })
  })

  test('basic push', async () => {
    await fixture(drop(TableA), async () => {
      await db.create(TableA)
      await db.insert(TableA).values({
        fieldA: 'hello',
        removeMe: 0,
        unchangedField: 'test'
      })
      await push(db, {TableB}, {force: true})
      const newNode = await db.select().from(TableB).get()
      test.equal(newNode, {
        id: 1,
        fieldB: 'hello',
        extraColumn: null,
        unchangedField: 'test',
        newRequiredField: 'default'
      })
      test.equal(await push.plan(db, {TableB}), [])
    })
  })

  test('push unique constraint', async () => {
    await fixture(drop(TableA), async () => {
      await db.create(TableA)
      await db.insert(TableA).values({
        fieldA: 'unique1',
        removeMe: null,
        unchangedField: 'test1'
      })
      await rejects(test, async () => {
        await db.insert(TableA).values({
          fieldA: 'unique1',
          unchangedField: 'test2'
        })
      })
      await push(db, {TableB}, unchecked)
      await db.insert(TableB).values({
        fieldB: 'unique2',
        extraColumn: 'extra',
        unchangedField: 'test3',
        newRequiredField: 'custom'
      })
      await rejects(test, async () => {
        await db.insert(TableB).values({
          fieldB: 'unique2',
          extraColumn: 'different',
          unchangedField: 'test4',
          newRequiredField: 'custom2'
        })
      })
    })
  })

  test('multiple pushes', async () => {
    await fixture(drop(TableA), async () => {
      await db.create(TableA)
      await db.insert(TableA).values({
        fieldA: 'initial',
        unchangedField: 'unchanged'
      })
      await push(db, {TableB}, unchecked)
      const node = await db.select().from(TableB).get()
      test.equal(node?.fieldB, 'initial')
      test.equal(node?.newRequiredField, 'default')
      await db.insert(TableB).values({
        fieldB: 'second',
        extraColumn: 'extra',
        unchangedField: 'test',
        newRequiredField: 'custom'
      })
      await push(db, {TableC})
      test.equal(await push.plan(db, {TableC}), [])
      const nodes = await db.select().from(TableC).orderBy(TableC.id)
      test.equal(nodes.length, 2)
      test.equal(nodes[0].fieldB, 'initial')
      test.equal(nodes[1].fieldB, 'second')
      test.equal(nodes[1].extraColumn, 'extra')
      await rejects(test, async () => {
        await db.insert(TableC).values({
          fieldB: 'second',
          extraColumn: 'extra',
          unchangedField: 'different'
        })
      })
    })
  })

  test('push index modifications', async () => {
    await fixture(drop(TableA), async () => {
      await db.create(TableA)
      for (let i = 0; i < 5; i++)
        await db.insert(TableA).values({
          fieldA: `value${i}`,
          unchangedField: `test${i}`
        })
      await push(db, {TableB}, unchecked)
      for (let i = 5; i < 10; i++)
        await db.insert(TableB).values({
          fieldB: `value${i}`,
          extraColumn: `extra${i}`,
          unchangedField: `test${i}`,
          newRequiredField: `required${i}`
        })
      await push(db, {TableC})
      test.equal(await push.plan(db, {TableC}), [])
      test.equal(await db.$count(TableC), 10)
    })
  })

  test('push plan does not run', async () => {
    await fixture(drop(UserA), async () => {
      const create = await push.plan(db, {UserA})
      test.equal(create.length > 0, true)
      test.equal(await push.plan(db, {UserA}), create)
      await push(db, {UserA})
      const change = await push.plan(db, {UserB}, {force: true})
      test.equal(change.length > 0, true)
      await db.insert(UserA).values({name: 'kept', bio: 'kept'})
      test.equal(await db.select().from(UserA), [
        {id: 1, name: 'kept', bio: 'kept'}
      ])
    })
  })

  test('push refuses to lose data', async () => {
    await fixture(drop(UserA), async () => {
      await push(db, {UserA})
      await db.insert(UserA).values({name: 'a', bio: 'b'})
      await rejects(
        test,
        async () => {
          await push(db, {UserB})
        },
        'Push would drop column "name"'
      )
      test.equal(await db.select().from(UserA), [{id: 1, name: 'a', bio: 'b'}])
      await push(db, {UserB}, {force: true})
      test.equal(await db.select().from(UserB), [{id: 1, fullName: null}])
    })
  })

  test('push drops empty columns without force', async () => {
    await fixture(drop(UserA), async () => {
      await push(db, {UserA})
      await db.insert(UserA).values({})
      if (db.dialect.runtime === 'mysql')
        await rejects(
          test,
          async () => {
            await push(db, {UserB})
          },
          "MySQL can't keep writers out while it checks the data"
        )
      await push(db, {UserB}, unchecked)
      test.equal(await db.select().from(UserB), [{id: 1, fullName: null}])
    })
  })

  test('push refuses to narrow a type', async () => {
    const Wide = table('push_narrow', {id: id(), v: varchar('v', {length: 20})})
    const Narrow = table('push_narrow', {
      id: id(),
      v: varchar('v', {length: 5})
    })
    await fixture(drop(Wide), async () => {
      await push(db, {Narrow})
      await db.insert(Narrow).values({v: 'abc'})
      await push(db, {Wide})
      test.equal(await push.plan(db, {Wide}), [])
      // Sqlite doesn't enforce lengths, so nothing can be lost there
      if (db.dialect.runtime !== 'sqlite')
        await rejects(
          test,
          async () => {
            await push(db, {Narrow})
          },
          'Push would change column "v"'
        )
      await push(db, {Narrow}, {force: db.dialect.runtime !== 'sqlite'})
      test.equal(await db.select(Narrow.v).from(Narrow), ['abc'])
    })
  })

  test('push refuses not null over nulls', async () => {
    const Loose = table('push_nulls', {id: id(), v: integer()})
    const Strict = table('push_nulls', {
      id: id(),
      v: integer().notNull().default(7)
    })
    await fixture(drop(Loose), async () => {
      await push(db, {Loose})
      await db.insert(Loose).values([{v: null}, {v: 1}])
      await rejects(
        test,
        async () => {
          await push(db, {Strict})
        },
        'Push would make column "v" not null over null values'
      )
      await push(db, {Strict}, {force: true})
      test.equal(
        await db.select(Strict.v).from(Strict).orderBy(Strict.id),
        [7, 1]
      )
      test.equal(await push.plan(db, {Strict}), [])
    })
  })

  test('push renames a column', async () => {
    await fixture(drop(UserA), async () => {
      await push(db, {UserA})
      await db.insert(UserA).values({name: 'ada'})
      const rename = {rename: {'push_user.name': 'full_name'}}
      await push(db, {UserB}, {...rename, force: true})
      test.equal(await db.select().from(UserB), [{id: 1, fullName: 'ada'}])
      test.equal(await push.plan(db, {UserB}, rename), [])
    })
  })

  test('rename of a missing table', async () => {
    await fixture(drop(UserA), async () => {
      await push(db, {UserA})
      await db.insert(UserA).values({name: 'ada'})
      await rejects(
        test,
        async () => {
          await push(
            db,
            {UserB},
            {
              rename: {'push_usr.name': 'full_name'},
              force: true
            }
          )
        },
        'Rename "push_usr.name" is not a column of a pushed table'
      )
      test.equal(await db.select(UserA.name).from(UserA), ['ada'])
    })
  })

  test('push rejects an unknown rename target', async () => {
    await rejects(
      test,
      async () => {
        await push(db, {UserB}, {rename: {'push_user.name': 'nope'}})
      },
      'Unknown column "nope"'
    )
  })

  test('push orders tables by foreign keys', async () => {
    await fixture(drop(Post, Author), async () => {
      await push(db, {Post, Author})
      await db.insert(Author).values({id: 1, name: 'a'})
      await db.insert(Post).values({id: 1, author: 1, editor: 1})
      test.equal(await push.plan(db, {Post, Author}), [])
    })
  })

  test('push fails adding a required column to rows', async () => {
    const Before = table('push_required', {id: id()})
    const After = table('push_required', {id: id(), v: text().notNull()})
    await fixture(drop(Before), async () => {
      await push(db, {Before})
      await push(db, {After})
      await db.drop(After)
      await push(db, {Before})
      await db.insert(Before).values({})
      await rejects(
        test,
        async () => {
          await push(db, {After})
        },
        'Cannot add not null column "v" without a default'
      )
    })
  })

  test('push rejects another dialect', async () => {
    const other = db.dialect.runtime === 'sqlite' ? postgresPush : sqlitePush
    const expected = db.dialect.runtime === 'sqlite' ? 'postgres' : 'sqlite'
    await rejects(
      test,
      async () => {
        await other(db as any, {UserA})
      },
      `Expected a ${expected} database`
    )
  })

  test('plan against earlier changes', async () => {
    if (db.dialect.runtime === 'mysql') return
    const Parent = table('push_parent', {id: integer().primaryKey()})
    const Child = table('push_child', {
      id: integer().primaryKey(),
      parent: integer().references(Parent.id)
    })
    await fixture(drop(RenamedChild, RenamedParent), async () => {
      await push(db, {Parent, Child})
      const rename = {rename: {'push_parent.id': 'pid'}}
      // Renaming the column also renames the reference, so only the
      // rename runs
      const plan = await push.plan(db, {RenamedParent, RenamedChild}, rename)
      test.equal(plan.length, 1)
      await push(db, {RenamedParent, RenamedChild}, rename)
      test.equal(await push.plan(db, {RenamedParent, RenamedChild}), [])
      await db.insert(RenamedParent).values({pid: 1})
      await db.insert(RenamedChild).values({id: 1, parent: 1})
      test.equal(await db.select(RenamedChild.parent).from(RenamedChild), [1])
    })
  })

  test('push rejects a foreign key cycle', async () => {
    await drop(CycleA, CycleB)()
    await rejects(
      test,
      async () => {
        await push(db, {CycleA, CycleB})
      },
      'Foreign keys form a cycle between'
    )
    await rejects(test, async () => {
      await db.select().from(CycleA)
    })
  })

  test('push rejects temporary tables', async () => {
    const Scratch = temporaryTable('push_scratch', {id: integer()})
    await rejects(
      test,
      async () => {
        await push(db, {Scratch})
      },
      'Temporary tables cannot be pushed'
    )
  })

  test('push leaves other tables alone', async () => {
    await fixture(drop(UserA, Author), async () => {
      await push(db, {UserA, Author})
      await push(db, {UserA})
      await db.insert(Author).values({id: 1})
      test.equal(await db.$count(Author), 1)
    })
  })

  test('push takes a schema object', async () => {
    const related = Object.assign({}, Post)
    const schema = {Post, Author, related, helper: () => 1, name: 'x'}
    await fixture(drop(Post, Author), async () => {
      const plan = await push.plan(db, schema)
      test.equal(plan.filter(line => line.startsWith('create table')).length, 2)
      await push(db, schema)
      test.equal(await push.plan(db, schema), [])
    })
  })

  test('push rejects a table defined twice', async () => {
    await rejects(
      test,
      async () => {
        await push(db, {UserA, UserB})
      },
      'Table "push_user" is defined twice'
    )
    await rejects(
      test,
      async () => {
        // @ts-expect-error
        await push(db, UserA)
      },
      'Expected a schema object, not a table'
    )
    await rejects(
      test,
      async () => {
        await push(db, {other: 1})
      },
      'No tables in schema'
    )
  })

  test('create and drop take schema objects', async () => {
    // Namespaces list their keys alphabetically, the referencing table and
    // view first
    const Authors = view('push_authors').as(
      db.select({id: Author.id}).from(Author)
    )
    const Ids = view('push_ids').as(db.select({id: Authors.id}).from(Authors))
    const schema = {Ids, Post, Authors, Author, other: 1}
    const cleanup = async () => {
      await db.drop(Ids, Authors)
      await drop(Post, Author, UserA)()
    }
    await fixture(cleanup, async () => {
      await db.create(schema, UserA)
      await db.insert(Author).values({id: 1})
      await db.insert(Post).values({id: 1, author: 1})
      test.equal(await db.$count(Post), 1)
      test.equal(await db.select(Ids.id).from(Ids), [1])
      await db.drop({Authors, Ids})
      await db.drop({Author, Post})
      await db.create({Post, alias: alias(Post, 'p')}, Author)
      await db.drop(Author, {Post})
      test.equal(await db.$count(UserA), 0)
      test.equal(
        await failure(() => db.create({other: 1})),
        'No definitions in schema'
      )
      test.equal(
        // @ts-expect-error
        await failure(() => db.create(UserA.id)),
        'No definitions in schema'
      )
    })
  })

  test('create views over subqueries, ctes and sql', async () => {
    // Named to sort after the views that read from it
    const Base = view('push_zbase').as(db.select({id: Author.id}).from(Author))
    const sub = db.select({id: Base.id}).from(Base).as('s')
    const FromSub = view('push_from_sub').as(db.select({id: sub.id}).from(sub))
    const InSub = view('push_in_sub').as(
      db
        .select({id: Author.id})
        .from(Author)
        .where(inArray(Author.id, db.select(Base.id).from(Base)))
    )
    const cte = db.$with('c').as(db.select({id: Base.id}).from(Base))
    const WithCte = view('push_with_cte').as(
      db.with(cte).select({id: cte.id}).from(cte)
    )
    const FromSql = view('push_from_sql').as(
      db.select({one: sql<number>`1`}).from(sql`push_zbase`)
    )
    const Raw = view('push_raw', {id: integer()}).as(
      sql`select id from push_zbase`
    )
    const views = {FromSub, InSub, WithCte, FromSql, Raw, Base}
    const cleanup = async () => {
      await db.drop(views)
      await drop(Author)()
    }
    await fixture(cleanup, async () => {
      await db.create(views, Author)
      await db.insert(Author).values({id: 1})
      test.equal(await db.select(Raw.id).from(Raw), [1])
      test.equal(await db.select(WithCte.id).from(WithCte), [1])
    })
  })

  test('create views whose aliases name other views', async () => {
    const Daily = view('push_b_daily').as(
      db.select({push_a_summary: Author.id}).from(Author)
    )
    const Summary = view('push_a_summary').as(
      db.select({id: Daily.push_a_summary}).from(Daily)
    )
    const cleanup = async () => {
      await db.drop(Summary, Daily)
      await drop(Author)()
    }
    await fixture(cleanup, async () => {
      await db.create({Summary, Daily, Author})
      await db.insert(Author).values({id: 1})
      test.equal(await db.select(Summary.id).from(Summary), [1])
    })
  })
}

// Values that are neither definitions nor objects are refused
export function createTyped(db: Database): void {
  // @ts-expect-error
  void db.create(123)
  // @ts-expect-error
  void db.drop('x')
  void db.create({UserA}, Post, {a: 1})
  void db.create(fixtures)
  void push(db, fixtures)
  // @ts-expect-error
  void push(db, UserA)
}
