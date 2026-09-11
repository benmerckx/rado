import {suite} from '@alinea/suite'
import {eq} from '#/core/expr/Conditions.ts'
import {index} from '#/core/Index.ts'
import {mysqlTable} from '#/mysql.ts'
import {QueryBuilder} from '#/mysql/builder.ts'
import {int, varchar} from '#/mysql/columns.ts'
import {mysqlDialect} from '#/mysql/dialect.ts'

suite(import.meta, test => {
  const db = new QueryBuilder()

  const Users = mysqlTable('users', {
    id: int('id').primaryKey(),
    name: varchar('name', {length: 100}),
    age: int('age')
  })

  const Posts = mysqlTable('posts', {
    id: int('id').primaryKey(),
    userId: int('user_id'),
    text: varchar('text', {length: 100})
  })

  const usersNameIndex = index('users_name_index').on(Users.name)
  const usersAgeIndex = index('users_age_index').on(Users.age)
  const postsUserIdIndex = index('posts_user_id_index').on(Posts.userId)

  test('formats use index on from table', () => {
    const query = db
      .select()
      .from(Users, {useIndex: [usersNameIndex, usersAgeIndex]})
      .where(eq(Users.name, 'David'))

    test.equal(
      mysqlDialect.inline(query),
      "select `users`.`id`, `users`.`name`, `users`.`age` from `users` use index (`users_name_index`, `users_age_index`) where `users`.`name` = 'David'"
    )
  })

  test('formats insert ignore', () => {
    const query = db.insert(Users).ignore().values({id: 1, name: 'David'})

    test.equal(
      mysqlDialect.inline(query),
      "insert ignore into `users` (`id`, `name`, `age`) values (1, 'David', default)"
    )
  })

  test('formats force index on join table', () => {
    const query = db
      .select()
      .from(Users)
      .leftJoin(Posts, eq(Users.id, Posts.userId), {
        forceIndex: postsUserIdIndex
      })

    test.equal(
      mysqlDialect
        .inline(query)
        .includes(
          'from `users` left join `posts` force index (`posts_user_id_index`) on `users`.`id` = `posts`.`user_id`'
        ),
      true
    )
  })

  test('formats ignore index on cross join table', () => {
    const query = db
      .select()
      .from(Users)
      .crossJoin(Posts, {ignoreIndex: 'posts_user_id_index'})

    test.equal(
      mysqlDialect
        .inline(query)
        .includes(
          'from `users` cross join `posts` ignore index (`posts_user_id_index`)'
        ),
      true
    )
  })

  test('rejects unnamed index objects in hints', () => {
    const query = db.select().from(Users, {useIndex: index().on(Users.name)})

    test.throws(() => mysqlDialect.inline(query))
  })

  test('ignores hints on subqueries', () => {
    const sq = db.select().from(Users).as('sq')

    const query = db
      .select()
      // @ts-expect-error Index hints only apply to table targets.
      .from(sq, {useIndex: usersNameIndex})

    test.equal(
      mysqlDialect.inline(query),
      'select `sq`.`id`, `sq`.`name`, `sq`.`age` from (select `users`.`id`, `users`.`name`, `users`.`age` from `users`) as `sq`'
    )
  })
})
