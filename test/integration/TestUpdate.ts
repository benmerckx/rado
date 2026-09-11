import type {DefineTest} from '@alinea/suite'
import {type Database, eq, table} from '#/index.ts'
import {concat, integer} from '#/universal.ts'
import {Node} from './schema.ts'

export function testUpdate(db: Database, test: DefineTest) {
  test('update', async () => {
    await db.create(Node)
    try {
      await db.insert(Node).values({
        textField: 'hello',
        bool: true
      })

      await db
        .update(Node)
        .set({textField: concat(Node.textField, ' world')})
        .where(eq(Node.textField, 'hello'))

      const node = await db.select().from(Node).get()
      test.equal(node, {
        id: 1,
        textField: 'hello world',
        bool: true
      })
    } finally {
      await db.drop(Node)
    }
  })

  // see benmerckx/rado#21
  test('issue 21', async () => {
    const UserT = table('app_user', {
      id: integer('id').primaryKey().notNull(),
      updatedAt: integer('updated_at').notNull()
    })

    await db.create(UserT)

    try {
      const now = Math.trunc(+new Date() / 1000)

      await db.insert(UserT).values({id: 1, updatedAt: now})

      await db.update(UserT).set({updatedAt: now}).where(eq(UserT.id, 1))

      const user = await db.select().from(UserT).get()

      test.equal(user, {id: 1, updatedAt: now})
    } finally {
      await db.drop(UserT)
    }
  })

  test('update from and correlated scalar subquery', async () => {
    const Source = table('update_source', {
      id: integer().primaryKey().notNull(),
      value: integer().notNull()
    })
    const Target = table('update_target', {
      id: integer().primaryKey().notNull(),
      sourceId: integer('source_id').notNull(),
      value: integer().notNull()
    })

    await db.create(Source, Target)
    try {
      await db.insert(Source).values([
        {id: 1, value: 10},
        {id: 2, value: 20}
      ])
      await db.insert(Target).values([
        {id: 1, sourceId: 2, value: 0},
        {id: 2, sourceId: 1, value: 0}
      ])

      await db
        .update(Target)
        .set({value: Source.value})
        .from(Source)
        .where(eq(Target.sourceId, Source.id))

      test.equal(
        await db.select(Target.value).from(Target).orderBy(Target.id),
        [20, 10]
      )

      const correlated = db
        .select(Source.value)
        .from(Source)
        .where(eq(Source.id, Target.id))
        .limit(1)
      await db.update(Target).set({value: correlated})

      test.equal(
        await db.select(Target.value).from(Target).orderBy(Target.id),
        [10, 20]
      )
    } finally {
      await db.drop(Target, Source)
    }
  })
}
