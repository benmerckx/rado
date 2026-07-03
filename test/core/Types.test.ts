import {suite} from '@alinea/suite'
import type {HasSql} from '#/core/Internal.ts'
import type {Async, Deliver, Either, Sync} from '#/core/MetaData.ts'
import type {Database} from '#/index.ts'
import {
  alias,
  avg,
  count,
  countDistinct,
  eq,
  except,
  exceptAll,
  gt,
  include,
  intersect,
  intersectAll,
  lte,
  materializedView,
  max,
  min,
  sql,
  sum,
  table,
  union,
  unionAll,
  view
} from '#/index.ts'
import {boolean, integer, text} from '#/universal.ts'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false
const Expect = <T extends true>() => {}
const typecheck = (_run: () => void) => {}

suite(import.meta, test => {
  const User = table('User', {
    id: integer().primaryKey(),
    name: text().notNull(),
    active: boolean().notNull()
  })
  const Profile = table('Profile', {
    id: integer().primaryKey(),
    userId: integer().notNull(),
    bio: text()
  })
  const Post = table('Post', {
    id: integer().primaryKey(),
    userId: integer().notNull(),
    title: text().notNull()
  })

  test('deliver mode resolves sync, async, and either results', () => {
    typecheck(() => {
      Expect<Equal<Deliver<Sync<'sqlite'>, string>, string>>()
      Expect<Equal<Deliver<Async<'sqlite'>, string>, Promise<string>>>()
      Expect<Equal<Deliver<Either, string>, string | Promise<string>>>()
    })
  })

  test('select query result types', () => {
    typecheck(() => {
      const db: Database<Sync<'sqlite'>> = undefined!

      const allUsers = db.select().from(User)
      Expect<
        Equal<
          Awaited<typeof allUsers>,
          Array<{id: number; name: string; active: boolean}>
        >
      >()

      const names = db.select(User.name).from(User)
      Expect<Equal<Awaited<typeof names>, Array<string>>>()

      const row = db
        .select({id: User.id, label: sql<string>`upper(${User.name})`})
        .from(User)
        .get()
      Expect<Equal<typeof row, {id: number; label: string} | null>>()

      const distinct = db.selectDistinct({id: User.id}).from(User)
      Expect<Equal<Awaited<typeof distinct>, Array<{id: number}>>>()

      const first = db.select(User.id).from(User).where(gt(User.id, 0)).$first()
      Expect<Equal<Awaited<typeof first>, number>>()

      const typedSql = db.select({
        unknownValue: sql`lower(${User.name})`,
        knownValue: sql<string>`lower(${User.name})`
      })
      Expect<
        Equal<
          Awaited<typeof typedSql>,
          Array<{unknownValue: unknown; knownValue: string}>
        >
      >()
    })
  })

  test('joined select query result types', () => {
    typecheck(() => {
      const db: Database<Sync<'sqlite'>> = undefined!
      const profile = alias(Profile, 'profile')

      const implicitJoin = db
        .select()
        .from(User)
        .leftJoin(profile, eq(profile.userId, User.id))
      Expect<
        Equal<
          Awaited<typeof implicitJoin>,
          Array<{
            User: {id: number; name: string; active: boolean}
            profile: {id: number; userId: number; bio: string | null} | null
          }>
        >
      >()

      const explicitJoin = db
        .select({
          user: User,
          profile
        })
        .from(User)
        .leftJoin(profile, eq(profile.userId, User.id))
      Expect<
        Equal<
          Awaited<typeof explicitJoin>,
          Array<{
            user: {id: number; name: string; active: boolean}
            profile: {id: number; userId: number; bio: string | null} | null
          }>
        >
      >()

      const explicitTable = db
        .select(User)
        .from(User)
        .leftJoin(profile, eq(profile.userId, User.id))
      Expect<
        Equal<
          typeof explicitTable extends HasSql<infer Result> ? Result : never,
          {id: number; name: string; active: boolean}
        >
      >()

      const rightJoin = db
        .select()
        .from(User)
        .rightJoin(profile, eq(profile.userId, User.id))
      Expect<
        Equal<
          Awaited<typeof rightJoin>,
          Array<{
            User: {id: number; name: string; active: boolean} | null
            profile: {id: number; userId: number; bio: string | null}
          }>
        >
      >()

      const explicitRightJoin = db
        .select({
          user: User,
          profile
        })
        .from(User)
        .rightJoin(profile, eq(profile.userId, User.id))
      Expect<
        Equal<
          Awaited<typeof explicitRightJoin>,
          Array<{
            user: {id: number; name: string; active: boolean} | null
            profile: {id: number; userId: number; bio: string}
          }>
        >
      >()

      const fullJoin = db
        .select()
        .from(User)
        .fullJoin(profile, eq(profile.userId, User.id))
      Expect<
        Equal<
          Awaited<typeof fullJoin>,
          Array<{
            User: {id: number; name: string; active: boolean} | null
            profile: {id: number; userId: number; bio: string | null} | null
          }>
        >
      >()

      const explicitFullJoin = db
        .select({
          user: {
            id: User.id,
            name: User.name
          },
          profile: {
            id: profile.id,
            bio: profile.bio
          }
        })
        .from(User)
        .fullJoin(profile, eq(profile.userId, User.id))
      Expect<
        Equal<
          Awaited<typeof explicitFullJoin>,
          Array<{
            user: {id: number; name: string} | null
            profile: {id: number; bio: string | null} | null
          }>
        >
      >()

      const crossJoin = db.select().from(User).crossJoin(profile)
      Expect<
        Equal<
          Awaited<typeof crossJoin>,
          Array<{
            User: {id: number; name: string; active: boolean}
            profile: {id: number; userId: number; bio: string | null}
          }>
        >
      >()
    })
  })

  test('include query result types', () => {
    typecheck(() => {
      const db: Database<Sync<'sqlite'>> = undefined!

      const posts = include(
        db
          .select({id: Post.id, title: Post.title})
          .from(Post)
          .where(eq(Post.userId, User.id))
      )
      const users = db
        .select({
          id: User.id,
          posts
        })
        .from(User)
      Expect<
        Equal<
          Awaited<typeof users>,
          Array<{id: number; posts: Array<{id: number; title: string}>}>
        >
      >()

      const firstPost = db
        .select({
          post: include.one(
            db.select({id: Post.id, title: Post.title}).from(Post).limit(1)
          )
        })
        .from(User)
      Expect<
        Equal<
          Awaited<typeof firstPost>,
          Array<{post: {id: number; title: string} | null}>
        >
      >()

      const spreadSelection = db
        .select({
          ...User,
          posts
        })
        .from(User)
      Expect<
        Equal<
          Awaited<typeof spreadSelection>,
          Array<{
            id: number
            name: string
            active: boolean
            posts: Array<{id: number; title: string}>
          }>
        >
      >()
    })
  })

  test('insert, update, and delete returning result types', () => {
    typecheck(() => {
      const db: Database<Sync<'sqlite'>> = undefined!

      const inserted = db
        .insert(User)
        .values({name: 'Ada', active: true})
        .returning({id: User.id, name: User.name})
      Expect<
        Equal<Awaited<typeof inserted>, Array<{id: number; name: string}>>
      >()

      const insertedAll = db
        .insert(User)
        .values({name: 'Ada', active: true})
        .returning()
      Expect<
        Equal<
          Awaited<typeof insertedAll>,
          Array<{id: number; name: string; active: boolean}>
        >
      >()

      const updated = db
        .update(User)
        .set({name: 'Grace'})
        .where(eq(User.id, 1))
        .returning({id: User.id, active: User.active})
      Expect<
        Equal<Awaited<typeof updated>, Array<{id: number; active: boolean}>>
      >()

      const updatedAll = db
        .update(User)
        .set({active: false})
        .where(eq(User.id, 1))
        .returning()
      Expect<
        Equal<
          Awaited<typeof updatedAll>,
          Array<{id: number; name: string; active: boolean}>
        >
      >()

      const deleted = db.delete(User).where(eq(User.id, 1)).returning(User.id)
      Expect<Equal<Awaited<typeof deleted>, Array<number>>>()

      const deletedAll = db.delete(User).where(eq(User.id, 1)).returning()
      Expect<
        Equal<
          Awaited<typeof deletedAll>,
          Array<{id: number; name: string; active: boolean}>
        >
      >()
    })
  })

  test('cte, union, and prepared query result types', () => {
    typecheck(() => {
      const db: Database<Sync<'sqlite'>> = undefined!
      const pgDb: Database<Sync<'postgres'>> = undefined!

      const activeUsers = db
        .$with('active_users')
        .as(db.select({id: User.id, name: User.name}).from(User))
      const fromCte = db
        .with(activeUsers)
        .select({id: activeUsers.id, name: activeUsers.name})
        .from(activeUsers)
      Expect<
        Equal<Awaited<typeof fromCte>, Array<{id: number; name: string}>>
      >()

      const fibonacci = db.$with('fibonacci').as(
        db.select({n: sql.value(1), next: sql.value(1)}).unionAll(self =>
          db
            .select({
              n: self.next,
              next: sql<number>`${self.n} + ${self.next}`
            })
            .from(self)
            .where(lte(self.next, 13))
        )
      )
      const recursiveRows = db
        .withRecursive(fibonacci)
        .select({n: fibonacci.n, next: fibonacci.next})
        .from(fibonacci)
      Expect<
        Equal<Awaited<typeof recursiveRows>, Array<{n: number; next: number}>>
      >()
      const recursiveValues = db
        .withRecursive(fibonacci)
        .select(fibonacci.n)
        .from(fibonacci)
      Expect<Equal<Awaited<typeof recursiveValues>, Array<number>>>()

      const userIds = db.select({id: User.id}).from(User)
      const postUserIds = db.select({id: Post.userId}).from(Post)
      const combined = union(userIds, postUserIds)
      Expect<Equal<Awaited<typeof combined>, Array<{id: number}>>>()
      const combinedAll = unionAll(userIds, postUserIds)
      Expect<Equal<Awaited<typeof combinedAll>, Array<{id: number}>>>()
      const intersected = intersect(userIds, postUserIds)
      Expect<Equal<Awaited<typeof intersected>, Array<{id: number}>>>()
      const excepted = except(userIds, postUserIds)
      Expect<Equal<Awaited<typeof excepted>, Array<{id: number}>>>()
      const pgUserIds = pgDb.select({id: User.id}).from(User)
      const pgPostUserIds = pgDb.select({id: Post.userId}).from(Post)
      const intersectedAll = intersectAll(pgUserIds, pgPostUserIds)
      Expect<Equal<Awaited<typeof intersectedAll>, Array<{id: number}>>>()
      const exceptedAll = exceptAll(pgUserIds, pgPostUserIds)
      Expect<Equal<Awaited<typeof exceptedAll>, Array<{id: number}>>>()
      const chainedSet = userIds.unionAll(postUserIds).except(userIds)
      Expect<Equal<Awaited<typeof chainedSet>, Array<{id: number}>>>()

      const subquery = db
        .select({
          id: User.id,
          name: User.name
        })
        .from(User)
        .as('u')
      const fromSubquery = db
        .select({id: subquery.id, name: subquery.name})
        .from(subquery)
      Expect<
        Equal<Awaited<typeof fromSubquery>, Array<{id: number; name: string}>>
      >()

      // @ts-expect-error set operators require matching selection shape
      union(userIds, db.select({name: User.name}).from(User))
      // @ts-expect-error intersect all is not available for sqlite
      intersectAll(userIds, postUserIds)

      const prepared = db
        .select({id: User.id, name: User.name})
        .from(User)
        .where(eq(User.name, sql.placeholder('name')))
        .prepare<{name: string}>('user-by-name')
      const preparedRows = prepared.all({name: 'Ada'})
      Expect<Equal<typeof preparedRows, Array<{id: number; name: string}>>>()
      const preparedRow = prepared.get({name: 'Ada'})
      Expect<Equal<typeof preparedRow, Array<{id: number; name: string}>>>()
      const preparedRun = prepared.run({name: 'Ada'})
      Expect<Equal<typeof preparedRun, void>>()
      Expect<
        Equal<
          ReturnType<typeof prepared.execute>,
          Promise<Array<{id: number; name: string}>>
        >
      >()
    })
  })

  test('aggregate and distinct-on result types', () => {
    typecheck(() => {
      const db: Database<Sync<'sqlite'>> = undefined!
      const pgDb: Database<Sync<'postgres'>> = undefined!

      const aggregate = db
        .select({
          count: count(),
          countNames: countDistinct(User.name),
          averageId: avg(User.id),
          totalId: sum(User.id),
          minName: min(User.name),
          maxName: max(User.name)
        })
        .from(User)
      Expect<
        Equal<
          Awaited<typeof aggregate>,
          Array<{
            count: number
            countNames: number
            averageId: string | null
            totalId: string | null
            minName: string
            maxName: string
          }>
        >
      >()

      const firstCount = db.$count(User, gt(User.id, 0))
      Expect<Equal<Awaited<typeof firstCount>, number>>()

      const distinctOnRows = pgDb
        .selectDistinctOn([User.id], {id: User.id, name: User.name})
        .from(User)
      Expect<
        Equal<
          Awaited<typeof distinctOnRows>,
          Array<{id: number; name: string}>
        >
      >()
      // @ts-expect-error distinct on is postgres-only
      db.selectDistinctOn([User.id], {id: User.id})
    })
  })

  test('view and materialized view result types', () => {
    typecheck(() => {
      const db: Database<Sync<'sqlite'>> = undefined!
      const pgDb: Database<Sync<'postgres'>> = undefined!

      const activeUsers = view('active_users').as(
        db.select({id: User.id, name: User.name}).from(User)
      )
      const fromView = db.select().from(activeUsers)
      Expect<
        Equal<Awaited<typeof fromView>, Array<{id: number; name: string}>>
      >()

      const definedUsers = view('defined_users', {
        id: integer().primaryKey(),
        name: text().notNull()
      }).existing()
      const fromDefinedView = db.select().from(definedUsers)
      Expect<
        Equal<
          Awaited<typeof fromDefinedView>,
          Array<{id: number; name: string}>
        >
      >()

      const materializedUsers = materializedView('materialized_users').as(
        pgDb.select({id: User.id, name: User.name}).from(User)
      )
      const fromMaterializedView = pgDb.select().from(materializedUsers)
      Expect<
        Equal<
          Awaited<typeof fromMaterializedView>,
          Array<{id: number; name: string}>
        >
      >()
    })
  })

  test('raw sql execution result types', () => {
    typecheck(() => {
      const syncDb: Database<Sync<'sqlite'>> = undefined!
      const asyncDb: Database<Async<'sqlite'>> = undefined!
      const eitherDb: Database<Either> = undefined!

      const syncRow = syncDb.get(sql<{id: number; name: string}>`select 1`)
      Expect<Equal<typeof syncRow, {id: number; name: string}>>()

      const asyncRows = asyncDb.all(sql<{id: number}>`select 1`)
      Expect<Equal<typeof asyncRows, Promise<Array<{id: number}>>>>()

      const eitherRun = eitherDb.run(sql`select 1`)
      Expect<Equal<typeof eitherRun, void | Promise<void>>>()

      const syncExecute = syncDb.execute(sql`select 1`)
      Expect<Equal<typeof syncExecute, void>>()
    })
  })

  test('database delivery and transaction result types', () => {
    typecheck(() => {
      const syncDb: Database<Sync<'sqlite'>> = undefined!
      const asyncDb: Database<Async<'sqlite'>> = undefined!
      const eitherDb: Database<Either> = undefined!

      const syncRows = syncDb.all(syncDb.select({id: User.id}).from(User))
      Expect<Equal<typeof syncRows, Array<{id: number}>>>()

      const asyncRows = asyncDb.all(asyncDb.select({id: User.id}).from(User))
      Expect<Equal<typeof asyncRows, Promise<Array<{id: number}>>>>()

      const eitherRows = eitherDb.all(eitherDb.select({id: User.id}).from(User))
      Expect<
        Equal<
          typeof eitherRows,
          Array<{id: number}> | Promise<Array<{id: number}>>
        >
      >()

      const syncTx = syncDb.transaction(tx =>
        tx.select(User.id).from(User).get()
      )
      Expect<Equal<typeof syncTx, number | null>>()

      const asyncTx = asyncDb.transaction(async tx =>
        tx.select(User.id).from(User).get()
      )
      Expect<Equal<typeof asyncTx, Promise<number | null>>>()
    })
  })

  test('write inputs reject incompatible field values', () => {
    typecheck(() => {
      const db: Database<Sync<'sqlite'>> = undefined!
      const mysqlDb: Database<Sync<'mysql'>> = undefined!

      db.insert(User).values({name: 'Ada', active: true})
      // @ts-expect-error active must be a boolean input
      db.insert(User).values({name: 'Ada', active: 'true'})
      // @ts-expect-error name must be a string input
      db.update(User).set({name: 42})
      db.insert(User).values([{name: 'Ada', active: true}])
      db.insert(User)
        .values({name: 'Ada', active: true})
        .onConflictDoUpdate({
          target: User.id,
          set: {name: 'Grace'}
        })
      db.insert(User)
        .values({name: 'Ada', active: true})
        .onConflictDoUpdate({
          target: User.id,
          // @ts-expect-error conflict update values must match update shape
          set: {active: 'yes'}
        })
      db.insert(User)
        .values({name: 'Ada', active: true})
        .onConflictDoNothing({target: [User.id, User.name]})
        .onConflictDoUpdate({
          target: User.id,
          targetWhere: gt(User.id, 0),
          set: {name: 'Grace'},
          where: eq(User.active, true)
        })
      mysqlDb
        .insert(User)
        .values({name: 'Ada', active: true})
        .onDuplicateKeyUpdate({set: {name: 'Grace'}})
      mysqlDb
        .insert(User)
        .values({name: 'Ada', active: true})
        .onDuplicateKeyUpdate({
          // @ts-expect-error duplicate key update values must match update shape
          set: {active: 'yes'}
        })
    })
  })

  test('dml cte result types', () => {
    typecheck(() => {
      const db: Database<Sync<'sqlite'>> = undefined!

      const inserted = db
        .$with('inserted_user')
        .as(
          db
            .insert(User)
            .values({name: 'Ada', active: true})
            .returning({id: User.id, name: User.name})
        )
      const fromInserted = db
        .with(inserted)
        .select({id: inserted.id, name: inserted.name})
        .from(inserted)
      Expect<
        Equal<Awaited<typeof fromInserted>, Array<{id: number; name: string}>>
      >()

      const updated = db
        .$with('updated_user')
        .as(
          db
            .update(User)
            .set({active: false})
            .returning({id: User.id, active: User.active})
        )
      const fromUpdated = db
        .with(updated)
        .select({id: updated.id, active: updated.active})
        .from(updated)
      Expect<
        Equal<
          Awaited<typeof fromUpdated>,
          Array<{id: number; active: boolean}>
        >
      >()

      const deleted = db
        .$with('deleted_user')
        .as(db.delete(User).returning({id: User.id}))
      const fromDeleted = db.with(deleted).select({id: deleted.id}).from(deleted)
      Expect<Equal<Awaited<typeof fromDeleted>, Array<{id: number}>>>()
    })
  })
})
