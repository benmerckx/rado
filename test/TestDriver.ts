import {Assert, Test} from '@sinclair/carbon'
import {
  AsyncDatabase,
  type Database,
  type SyncDatabase
} from '../src/core/Database.ts'
import {table} from '../src/core/Table.ts'
import {eq, foreignKey, primaryKey, sql, unique} from '../src/index.ts'
import {
  boolean,
  generateTransaction,
  id,
  int,
  json,
  text
} from '../src/universal.ts'

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
  userId: int().notNull(),
  title: text().notNull()
})

const TableA = table('TableA', {
  id: id()
})

const TableB = table(
  'TableB',
  {
    isUnique: int().unique(),
    hasRef: int().references(TableA.id),
    colA: int(),
    colB: int().unique()
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
  name: string,
  createDb: () => Promise<Database>
) {
  const db = await createDb()
  const isAsync = db instanceof AsyncDatabase

  Test.describe(`Driver: ${name}`, async () => {
    Test.it('create table', async () => {
      try {
        await db.createTable(Node)
        await db.insert(Node).values({
          textField: 'hello',
          bool: true
        })
        const nodes = await db.select().from(Node)
        Assert.isEqual(nodes, [{id: 1, textField: 'hello', bool: true}])
        await db.update(Node).set({textField: 'world'}).where(eq(Node.id, 1))
        const [node] = await db.select(Node.textField).from(Node)
        Assert.isEqual(node, 'world')
      } finally {
        await db.dropTable(Node)
      }
    })

    Test.it('prepared queries', async () => {
      try {
        await db.createTable(Node)
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
        Assert.isEqual(rows, [{id: 1, textField: 'hello', bool: true}])
      } finally {
        await db.dropTable(Node)
      }
    })

    Test.it('joins', async () => {
      try {
        await db.createTable(User)
        await db.createTable(Post)
        const [user1, user2] = await db
          .insert(User)
          .values([{name: 'Bob'}, {name: 'Mario'}])
          .returning(User.id)
        const [post1, post2] = await db
          .insert(Post)
          .values([
            {userId: user1, title: 'Post 1'},
            {userId: user1, title: 'Post 2'}
          ])
          .returning(Post.id)
        const posts = await db.select().from(Post)
        Assert.isEqual(posts, [
          {id: post1, userId: user1, title: 'Post 1'},
          {id: post2, userId: user1, title: 'Post 2'}
        ])
        const userAndPosts = await db
          .select()
          .from(User)
          .innerJoin(Post, eq(Post.userId, User.id))
          .where(eq(User.id, user1))
        Assert.isEqual(userAndPosts, [
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
        Assert.isEqual(noPosts, [
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

        Assert.isEqual(rightJoin, [
          {
            Post: null,
            User: {id: 2, name: 'Mario'}
          }
        ])
      } finally {
        await db.dropTable(User)
        await db.dropTable(Post)
      }
    })

    const WithJson = table('WithJson', {
      id: id(),
      data: json<{sub: {field: string}}>()
    })

    Test.it('json fields', async () => {
      try {
        await db.createTable(WithJson)
        const data = {sub: {field: 'value'}}
        await db.insert(WithJson).values({data})
        const [row] = await db
          .select()
          .from(WithJson)
          .where(eq(WithJson.data.sub.field, 'value'))
        Assert.isEqual(row, {id: 1, data})
      } finally {
        await db.dropTable(WithJson)
      }
    })

    Test.it('transactions', async () => {
      if (isAsync) {
        const asyncDb = db as AsyncDatabase<'universal'>
        try {
          await asyncDb.createTable(Node)
          await asyncDb.transaction(async tx => {
            await tx.insert(Node).values({
              textField: 'hello',
              bool: true
            })
            const nodes = await tx.select().from(Node)
            Assert.isEqual(nodes, [{id: 1, textField: 'hello', bool: true}])
            tx.rollback()
          })
        } catch {
          const nodes = await asyncDb.select().from(Node)
          Assert.isEqual(nodes, [])
        } finally {
          await asyncDb.dropTable(Node)
        }
      } else {
        const syncDb = db as SyncDatabase<'universal'>
        try {
          syncDb.createTable(Node).run()
          syncDb.transaction((tx): void => {
            tx.insert(Node).values({
              textField: 'hello',
              bool: true
            })
            const nodes = tx.select().from(Node).all()
            Assert.isEqual(nodes, [{id: 1, textField: 'hello', bool: true}])
            tx.rollback()
          })
          const nodes = syncDb.select().from(Node).all()
          Assert.isEqual(nodes, [])
        } catch {
          const nodes = syncDb.select().from(Node).all()
          Assert.isEqual(nodes, [])
        } finally {
          syncDb.dropTable(Node).run()
        }
      }
    })

    Test.it('generator transactions', async () => {
      const result = await db.transaction(
        generateTransaction(function* (tx) {
          yield* tx.createTable(Node)
          yield* tx.insert(Node).values({
            textField: 'hello',
            bool: true
          })
          const nodes = yield* tx.select().from(Node)
          Assert.isEqual(nodes, [{id: 1, textField: 'hello', bool: true}])
          yield* tx.dropTable(Node)
          return 1
        })
      )
      Assert.isEqual(result, 1)
    })

    Test.it('constraints and indexes', async () => {
      try {
        await db.createTable(TableA)
        await db.createTable(TableB)
        await db.insert(TableA).values({})
        await db.insert(TableB).values({
          isUnique: 1,
          hasRef: 1,
          colA: 1,
          colB: 1
        })
        const [row] = await db.select().from(TableB)
        Assert.isEqual(row, {
          isUnique: 1,
          hasRef: 1,
          colA: 1,
          colB: 1
        })
      } finally {
        await db.dropTable(TableB)
        await db.dropTable(TableA)
      }
    })
  })
}
