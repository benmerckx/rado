import type {DefineTest} from '@alinea/suite'
import {
  type Database,
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
  const clean = async (...tables: Array<Table>) => {
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
    await clean(...tables)
    try {
      await push(db, ...tables)
      test.equal(await push.plan(db, ...tables), [])
    } finally {
      await clean(...tables)
    }
  })

  test('push creates missing table', async () => {
    await clean(TableB)
    try {
      await push(db, TableB)
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
      test.equal(await push.plan(db, TableB), [])
    } finally {
      await clean(TableB)
    }
  })

  test('basic push', async () => {
    await clean(TableA)
    await db.create(TableA)
    try {
      await db.insert(TableA).values({
        fieldA: 'hello',
        removeMe: 0,
        unchangedField: 'test'
      })
      await push(db, TableB, {force: true})
      const newNode = await db.select().from(TableB).get()
      test.equal(newNode, {
        id: 1,
        fieldB: 'hello',
        extraColumn: null,
        unchangedField: 'test',
        newRequiredField: 'default'
      })
      test.equal(await push.plan(db, TableB), [])
    } finally {
      await clean(TableB)
    }
  })

  test('push unique constraint', async () => {
    await clean(TableA)
    await db.create(TableA)
    try {
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
      await push(db, TableB)
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
    } finally {
      await clean(TableB)
    }
  })

  test('multiple pushes', async () => {
    await clean(TableA)
    await db.create(TableA)
    try {
      await db.insert(TableA).values({
        fieldA: 'initial',
        unchangedField: 'unchanged'
      })
      await push(db, TableB)
      const node = await db.select().from(TableB).get()
      test.equal(node?.fieldB, 'initial')
      test.equal(node?.newRequiredField, 'default')
      await db.insert(TableB).values({
        fieldB: 'second',
        extraColumn: 'extra',
        unchangedField: 'test',
        newRequiredField: 'custom'
      })
      await push(db, TableC)
      test.equal(await push.plan(db, TableC), [])
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
    } finally {
      await clean(TableC)
    }
  })

  test('push index modifications', async () => {
    await clean(TableA)
    await db.create(TableA)
    try {
      for (let i = 0; i < 5; i++)
        await db.insert(TableA).values({
          fieldA: `value${i}`,
          unchangedField: `test${i}`
        })
      await push(db, TableB)
      for (let i = 5; i < 10; i++)
        await db.insert(TableB).values({
          fieldB: `value${i}`,
          extraColumn: `extra${i}`,
          unchangedField: `test${i}`,
          newRequiredField: `required${i}`
        })
      await push(db, TableC)
      test.equal(await push.plan(db, TableC), [])
      test.equal(await db.$count(TableC), 10)
    } finally {
      await clean(TableC)
    }
  })

  test('push plan does not run', async () => {
    await clean(UserA)
    try {
      const create = await push.plan(db, UserA)
      test.equal(create.length > 0, true)
      test.equal(await push.plan(db, UserA), create)
      await push(db, UserA)
      const change = await push.plan(db, UserB, {force: true})
      test.equal(change.length > 0, true)
      await db.insert(UserA).values({name: 'kept', bio: 'kept'})
      test.equal(await db.select().from(UserA), [
        {id: 1, name: 'kept', bio: 'kept'}
      ])
    } finally {
      await clean(UserA)
    }
  })

  test('push refuses to lose data', async () => {
    await clean(UserA)
    try {
      await push(db, UserA)
      await db.insert(UserA).values({name: 'a', bio: 'b'})
      await rejects(
        test,
        async () => {
          await push(db, UserB)
        },
        'Push would drop column "name" with data'
      )
      test.equal(await db.select().from(UserA), [{id: 1, name: 'a', bio: 'b'}])
      await push(db, UserB, {force: true})
      test.equal(await db.select().from(UserB), [{id: 1, fullName: null}])
    } finally {
      await clean(UserA)
    }
  })

  test('push drops empty columns without force', async () => {
    await clean(UserA)
    try {
      await push(db, UserA)
      await db.insert(UserA).values({})
      await push(db, UserB)
      test.equal(await db.select().from(UserB), [{id: 1, fullName: null}])
    } finally {
      await clean(UserA)
    }
  })

  test('push refuses to narrow a type', async () => {
    const Wide = table('push_narrow', {id: id(), v: varchar('v', {length: 20})})
    const Narrow = table('push_narrow', {
      id: id(),
      v: varchar('v', {length: 5})
    })
    await clean(Wide)
    try {
      await push(db, Narrow)
      await db.insert(Narrow).values({v: 'abc'})
      await push(db, Wide)
      test.equal(await push.plan(db, Wide), [])
      await rejects(
        test,
        async () => {
          await push(db, Narrow)
        },
        'Push would change column "v"'
      )
      await push(db, Narrow, {force: true})
      test.equal(await db.select(Narrow.v).from(Narrow), ['abc'])
    } finally {
      await clean(Wide)
    }
  })

  test('push refuses not null over nulls', async () => {
    const Loose = table('push_nulls', {id: id(), v: integer()})
    const Strict = table('push_nulls', {
      id: id(),
      v: integer().notNull().default(7)
    })
    await clean(Loose)
    try {
      await push(db, Loose)
      await db.insert(Loose).values([{v: null}, {v: 1}])
      await rejects(
        test,
        async () => {
          await push(db, Strict)
        },
        'Push would make column "v" not null over null values'
      )
      await push(db, Strict, {force: true})
      test.equal(
        await db.select(Strict.v).from(Strict).orderBy(Strict.id),
        [7, 1]
      )
      test.equal(await push.plan(db, Strict), [])
    } finally {
      await clean(Loose)
    }
  })

  test('push renames a column', async () => {
    await clean(UserA)
    try {
      await push(db, UserA)
      await db.insert(UserA).values({name: 'ada'})
      const rename = {rename: {'push_user.name': 'full_name'}}
      await push(db, UserB, {...rename, force: true})
      test.equal(await db.select().from(UserB), [{id: 1, fullName: 'ada'}])
      test.equal(await push.plan(db, UserB, rename), [])
    } finally {
      await clean(UserA)
    }
  })

  test('push rejects an unknown rename target', async () => {
    await rejects(
      test,
      async () => {
        await push(db, UserB, {rename: {'push_user.name': 'nope'}})
      },
      'Unknown column "nope"'
    )
  })

  test('push orders tables by foreign keys', async () => {
    await clean(Post, Author)
    try {
      await push(db, Post, Author)
      await db.insert(Author).values({id: 1, name: 'a'})
      await db.insert(Post).values({id: 1, author: 1, editor: 1})
      test.equal(await push.plan(db, Post, Author), [])
    } finally {
      await clean(Post, Author)
    }
  })

  test('push fails adding a required column to rows', async () => {
    const Before = table('push_required', {id: id()})
    const After = table('push_required', {id: id(), v: text().notNull()})
    await clean(Before)
    try {
      await push(db, Before)
      await push(db, After)
      await db.drop(After)
      await push(db, Before)
      await db.insert(Before).values({})
      await rejects(
        test,
        async () => {
          await push(db, After)
        },
        'Cannot add not null column "v" without a default'
      )
    } finally {
      await clean(Before)
    }
  })

  test('push rejects another dialect', async () => {
    const other = db.dialect.runtime === 'sqlite' ? postgresPush : sqlitePush
    const expected = db.dialect.runtime === 'sqlite' ? 'postgres' : 'sqlite'
    await rejects(
      test,
      async () => {
        await other(db, UserA)
      },
      `Expected a ${expected} database`
    )
  })

  test('push rejects temporary tables', async () => {
    const Scratch = temporaryTable('push_scratch', {id: integer()})
    await rejects(
      test,
      async () => {
        await push(db, Scratch)
      },
      'Temporary tables cannot be pushed'
    )
  })

  test('push leaves other tables alone', async () => {
    await clean(UserA, Author)
    try {
      await push(db, UserA, Author)
      await push(db, UserA)
      await db.insert(Author).values({id: 1})
      test.equal(await db.$count(Author), 1)
    } finally {
      await clean(UserA, Author)
    }
  })
}
