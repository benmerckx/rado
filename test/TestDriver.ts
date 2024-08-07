import {suite} from '@benmerckx/suite'
import {
  AsyncDatabase,
  type Database,
  type SyncDatabase
} from '../src/core/Database.ts'
import {table} from '../src/core/Table.ts'
import {include} from '../src/core/expr/Include.ts'
import {and, eq, foreignKey, primaryKey, sql, unique} from '../src/index.ts'
import {
  boolean,
  id,
  integer,
  json,
  lastInsertId,
  text,
  txGenerator
} from '../src/universal.ts'

const Node = table('Node', {
  id: id().notNull(),
  textField: text().notNull(),
  bool: boolean()
})

const User = table('User', {
  id: id(),
  name: text().notNull()
})

const Post = table('Post', {
  id: id(),
  userId: integer().notNull(),
  title: text().notNull()
})

const TableA = table('TableA', {
  id: id()
})

const TableB = table(
  'TableB',
  {
    isUnique: integer().unique(),
    hasRef: integer().references(TableA.id),
    colA: integer(),
    colB: integer().unique()
  },
  TableB => {
    return {
      uniqueA: unique().on(TableB.colA),
      multiPk: primaryKey(TableB.colA, TableB.colB),
      multiRef: foreignKey(TableB.colA).references(TableA.id)
    }
  }
)

export async function testDriver(
  meta: ImportMeta,
  createDb: () => Promise<Database>,
  supportsDiff = true
) {
  const db = await createDb()
  const isAsync = db instanceof AsyncDatabase

  suite(meta, test => {
    test('create table', async () => {
      try {
        await db.create(Node)
        const nothing = await db.select().from(Node).get()
        test.equal(nothing, null)
        await db.insert(Node).values({
          textField: 'hello',
          bool: true
        })
        const nodes = await db.select().from(Node)
        test.equal(nodes, [{id: 1, textField: 'hello', bool: true}])
        await db.update(Node).set({textField: 'world'}).where(eq(Node.id, 1))
        const textField = db.select(Node.textField).from(Node)
        test.equal(await textField.get(), 'world')
        await db.update(Node).set({
          textField: db.select(sql.value('test'))
        })
        test.equal(await textField.get(), 'test')
      } finally {
        await db.drop(Node)
      }
    })

    test('prepared queries', async () => {
      try {
        await db.create(Node)
        await db.insert(Node).values({
          textField: 'hello',
          bool: true
        })
        const query = db
          .select()
          .from(Node)
          .where(eq(Node.textField, sql.placeholder('text')))
          .prepare<{text: string}>('prepared')
        const rows = await query.execute({text: 'hello'})
        test.equal(rows, [{id: 1, textField: 'hello', bool: true}])
      } finally {
        await db.drop(Node)
      }
    })

    test('joins', async () => {
      try {
        await db.create(User, Post)
        await db.insert(User).values({name: 'Bob'})
        const user1 = await db.select(lastInsertId()).get()
        await db.insert(User).values({name: 'Mario'})
        const user2 = await db.select(lastInsertId()).get()
        await db.insert(Post).values({userId: user1!, title: 'Post 1'})
        const post1 = await db.select(lastInsertId()).get()
        await db.insert(Post).values({userId: user1!, title: 'Post 2'})
        const post2 = await db.select(lastInsertId()).get()
        const posts = await db.select().from(Post)
        test.equal(posts, [
          {id: post1, userId: user1, title: 'Post 1'},
          {id: post2, userId: user1, title: 'Post 2'}
        ])
        const userAndPosts = await db
          .select()
          .from(User)
          .innerJoin(Post, eq(Post.userId, User.id))
          .where(eq(User.id, user1))
        test.equal(userAndPosts, [
          {
            User: {id: user1, name: 'Bob'},
            Post: {id: post1, userId: user1, title: 'Post 1'}
          },
          {
            User: {id: user1, name: 'Bob'},
            Post: {id: post2, userId: user1, title: 'Post 2'}
          }
        ])

        const noPosts = await db
          .select()
          .from(User)
          .leftJoin(Post, eq(Post.userId, 42))
          .where(eq(User.id, user1))
        test.equal(noPosts, [
          {
            User: {id: user1, name: 'Bob'},
            Post: null
          }
        ])

        const rightJoin = await db
          .select()
          .from(Post)
          .rightJoin(User, eq(User.id, Post.userId))
          .where(eq(User.id, user2))

        test.equal(rightJoin, [
          {
            Post: null,
            User: {id: 2, name: 'Mario'}
          }
        ])
      } finally {
        await db.drop(User, Post)
      }
    })

    const WithJson = table('WithJson', {
      id: id(),
      data: json<{sub: {field: string}; arr: Array<number>}>()
    })

    test('json fields', async () => {
      try {
        await db.create(WithJson)
        const data = {sub: {field: 'value'}, arr: [1, 2, 3]}
        await db.insert(WithJson).values({data})
        const [row] = await db
          .select()
          .from(WithJson)
          .where(
            and(
              eq(WithJson.data.sub.field, 'value'),
              eq(WithJson.data.arr[0], 1)
            )
          )
        test.equal(row, {id: 1, data})
      } finally {
        await db.drop(WithJson)
      }
    })

    test('transactions', async () => {
      if (isAsync) {
        const asyncDb = db as AsyncDatabase<'universal'>
        try {
          await asyncDb.create(Node)
          await asyncDb.transaction(async tx => {
            await tx.insert(Node).values({
              textField: 'hello',
              bool: true
            })
            const nodes = await tx.select().from(Node)
            test.equal(nodes, [{id: 1, textField: 'hello', bool: true}])
            tx.rollback()
          })
        } catch (err) {
          test.equal((<Error>err).message, 'Rollback')
          const nodes = await asyncDb.select().from(Node)
          test.equal(nodes, [])
        } finally {
          await asyncDb.drop(Node)
        }
      } else {
        const syncDb = db as SyncDatabase<'universal'>
        try {
          syncDb.create(Node).run()
          syncDb.transaction((tx): void => {
            tx.insert(Node).values({
              textField: 'hello',
              bool: true
            })
            const nodes = tx.select().from(Node).all()
            test.equal(nodes, [{id: 1, textField: 'hello', bool: true}])
            tx.rollback()
          })
          const nodes = syncDb.select().from(Node).all()
          test.equal(nodes, [])
        } catch {
          const nodes = syncDb.select().from(Node).all()
          test.equal(nodes, [])
        } finally {
          syncDb.drop(Node).run()
        }
      }
    })

    test('generator transactions', async () => {
      const result = await db.transaction(
        txGenerator(function* (tx) {
          yield* tx.create(Node)
          yield* tx.insert(Node).values({
            textField: 'hello',
            bool: true
          })
          const nodes = yield* tx.select().from(Node)
          test.equal(nodes, [{id: 1, textField: 'hello', bool: true}])
          yield* tx.drop(Node)
          return 1
        })
      )
      test.equal(result, 1)
    })

    test('constraints and indexes', async () => {
      try {
        await db.create(TableA, TableB)
        await db.insert(TableA).values({})
        await db.insert(TableB).values({
          isUnique: 1,
          hasRef: 1,
          colA: 1,
          colB: 1
        })
        const [row] = await db.select().from(TableB)
        test.equal(row, {
          isUnique: 1,
          hasRef: 1,
          colA: 1,
          colB: 1
        })
      } finally {
        await db.drop(TableB, TableA)
      }
    })

    test('include', async () => {
      const User = table('User', {
        id: id(),
        name: text().notNull()
      })
      const Post = table('Post', {
        id: id(),
        userId: integer().notNull(),
        title: text().notNull()
      })
      await db.create(User, Post)
      await db.insert(User).values({name: 'Bob'})
      const user1 = await db.select(lastInsertId()).get()
      await db.insert(Post).values({userId: user1!, title: 'Post 1'})
      await db.insert(Post).values({userId: user1!, title: 'Post 2'})
      const posts = include(
        db.select().from(Post).where(eq(Post.userId, User.id))
      )
      const result = await db
        .select({...User, posts})
        .from(User)
        .where(eq(User.id, user1))
        .get()
      test.equal(result, {
        id: user1,
        name: 'Bob',
        posts: [
          {id: 1, userId: user1, title: 'Post 1'},
          {id: 2, userId: user1, title: 'Post 2'}
        ]
      })
      const emptyOne = await db
        .select({
          empty: include.one(db.select().from(User).where(eq(User.id, 42)))
        })
        .get()
      test.equal(emptyOne, {empty: null})
      const postsWithUser = await db
        .select({
          ...Post,
          user: include.one(
            db.select().from(User).where(eq(User.id, Post.userId))
          )
        })
        .from(Post)
      test.equal(postsWithUser, [
        {
          id: 1,
          userId: user1,
          title: 'Post 1',
          user: {id: user1, name: 'Bob'}
        },
        {
          id: 2,
          userId: user1,
          title: 'Post 2',
          user: {id: user1, name: 'Bob'}
        }
      ])

      const emptyResult = await db.select({
        empty: include(db.select().from(User).where(eq(User.id, 42)))
      })
      test.equal(emptyResult, [{empty: []}])

      const nestedResult = await db
        .select({
          user: include.one(
            db
              .select({
                ...User,
                posts: include(
                  db.select().from(Post).where(eq(Post.userId, User.id))
                )
              })
              .from(User)
          )
        })
        .get()
      test.equal(nestedResult, {
        user: {
          id: user1,
          name: 'Bob',
          posts: [
            {id: 1, userId: user1, title: 'Post 1'},
            {id: 2, userId: user1, title: 'Post 2'}
          ]
        }
      })
      await db.drop(User, Post)
    })

    if (supportsDiff)
      test('migrate', async () => {
        const TableA = table('Table', {
          id: id(),
          fieldA: text(),
          removeMe: text()
        })

        await db.create(TableA)
        await db.insert(TableA).values({fieldA: 'hello', removeMe: 'world'})

        const node = await db.select().from(TableA).get()
        test.equal(node, {id: 1, fieldA: 'hello', removeMe: 'world'})

        const TableB = table('Table', {
          id: id(),
          fieldB: text('fieldA'),
          extraColumn: text()
        })

        await db.migrate(TableB)
        const newNode = await db.select().from(TableB).get()
        test.equal(newNode, {id: 1, fieldB: 'hello', extraColumn: null})
        await db.drop(TableB)
      })
  })
}
