import {type Database, eq, table} from '@/index.ts'
import {concat, integer} from '@/universal.ts'
import type {DefineTest} from '@alinea/suite'
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
}
