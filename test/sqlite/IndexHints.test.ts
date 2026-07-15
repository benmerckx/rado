import {suite} from '@alinea/suite'
import {eq} from '#/core/expr/Conditions.ts'
import {index} from '#/core/Index.ts'
import {sqliteTable} from '#/sqlite.ts'
import {QueryBuilder} from '#/sqlite/builder.ts'
import {integer, text} from '#/sqlite/columns.ts'
import {sqliteDialect} from '#/sqlite/dialect.ts'

suite(import.meta, test => {
  const db = new QueryBuilder()

  const Users = sqliteTable('users', {
    id: integer('id').primaryKey(),
    name: text('name'),
    age: integer('age')
  })

  const Posts = sqliteTable('posts', {
    id: integer('id').primaryKey(),
    userId: integer('user_id'),
    text: text('text')
  })

  const usersNameIndex = index('users_name_index').on(Users.name)
  const postsUserIdIndex = index('posts_user_id_index').on(Posts.userId)

  test('formats indexed by on from table', () => {
    const query = db
      .select()
      .from(Users, {indexedBy: usersNameIndex})
      .where(eq(Users.name, 'David'))

    test.equal(
      sqliteDialect.inline(query),
      'select "users"."id", "users"."name", "users"."age" from "users" indexed by "users_name_index" where "users"."name" = \'David\''
    )
  })

  test('formats indexed by on join table', () => {
    const query = db
      .select()
      .from(Users)
      .leftJoin(Posts, eq(Users.id, Posts.userId), {
        indexedBy: postsUserIdIndex
      })

    test.equal(
      sqliteDialect
        .inline(query)
        .includes(
          'from "users" left join "posts" indexed by "posts_user_id_index" on "users"."id" = "posts"."user_id"'
        ),
      true
    )
  })

  test('rejects unnamed index objects in indexed by', () => {
    const query = db.select().from(Users, {indexedBy: index().on(Users.name)})

    test.throws(() => sqliteDialect.inline(query))
  })
})
