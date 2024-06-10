import {
  AsyncDatabase,
  type Database,
  type SyncDatabase
} from '../src/core/Database.ts'
import {table} from '../src/core/Table.ts'
import {and, eq, foreignKey, primaryKey, sql, unique} from '../src/index.ts'
import {
  boolean,
  generateTransaction,
  id,
  integer,
  json,
  lastInsertId,
  text
} from '../src/universal.ts'
import {suite} from './Suite.ts'

const Node = table('Node', {
  id: id(),
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
  createDb: () => Promise<Database>
) {
  const db = await createDb()
  const isAsync = db instanceof AsyncDatabase

  suite(meta, ({test, isEqual}) => {
    test('create table', async () => {
      try {
        await db.create(Node)
        await db.insert(Node).values({
          textField: 'hello',
          bool: true
        })
        const nodes = await db.select().from(Node)
        isEqual(nodes, [{id: 1, textField: 'hello', bool: true}])
        await db.update(Node).set({textField: 'world'}).where(eq(Node.id, 1))
        const [node] = await db.select(Node.textField).from(Node)
        isEqual(node, 'world')
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
        isEqual(rows, [{id: 1, textField: 'hello', bool: true}])
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
        await db.insert(Post).values({userId: user1, title: 'Post 1'})
        const post1 = await db.select(lastInsertId()).get()
        await db.insert(Post).values({userId: user1, title: 'Post 2'})
        const post2 = await db.select(lastInsertId()).get()
        const posts = await db.select().from(Post)
        isEqual(posts, [
          {id: post1, userId: user1, title: 'Post 1'},
          {id: post2, userId: user1, title: 'Post 2'}
        ])
        const userAndPosts = await db
          .select()
          .from(User)
          .innerJoin(Post, eq(Post.userId, User.id))
          .where(eq(User.id, user1))
        isEqual(userAndPosts, [
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
        isEqual(noPosts, [
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

        isEqual(rightJoin, [
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
        isEqual(row, {id: 1, data})
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
            isEqual(nodes, [{id: 1, textField: 'hello', bool: true}])
            tx.rollback()
          })
        } catch (err) {
          isEqual((<Error>err).message, 'Rollback')
          const nodes = await asyncDb.select().from(Node)
          isEqual(nodes, [])
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
            isEqual(nodes, [{id: 1, textField: 'hello', bool: true}])
            tx.rollback()
          })
          const nodes = syncDb.select().from(Node).all()
          isEqual(nodes, [])
        } catch {
          const nodes = syncDb.select().from(Node).all()
          isEqual(nodes, [])
        } finally {
          syncDb.drop(Node).run()
        }
      }
    })

    test('generator transactions', async () => {
      const result = await db.transaction(
        generateTransaction(function* (tx) {
          yield* tx.create(Node)
          yield* tx.insert(Node).values({
            textField: 'hello',
            bool: true
          })
          const nodes = yield* tx.select().from(Node)
          isEqual(nodes, [{id: 1, textField: 'hello', bool: true}])
          yield* tx.drop(Node)
          return 1
        })
      )
      isEqual(result, 1)
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
        isEqual(row, {
          isUnique: 1,
          hasRef: 1,
          colA: 1,
          colB: 1
        })
      } finally {
        await db.drop(TableB, TableA)
      }
    })
  })
}
