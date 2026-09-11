import {suite} from '@alinea/suite'
import type {Builder} from '#/core/Builder.ts'
import {eq, sql, table} from '#/index.ts'
import {QueryBuilder as MysqlQueryBuilder} from '#/mysql/builder.ts'
import {mysqlDialect} from '#/mysql/dialect.ts'
import {QueryBuilder as PostgresQueryBuilder} from '#/postgres/builder.ts'
import {postgresDialect} from '#/postgres/dialect.ts'
import {QueryBuilder as SqliteQueryBuilder} from '#/sqlite/builder.ts'
import {integer, json} from '#/sqlite/columns.ts'
import {sqliteDialect} from '#/sqlite/dialect.ts'
import {Functions} from '../../src/core/expr/Functions.ts'
import {builder, emit} from '../TestUtils.ts'

suite(import.meta, test => {
  const definition = {
    id: integer().primaryKey(),
    withDefault: integer().default(2),
    required: integer().notNull(),
    nullable: integer(),
    data: json()
  }

  const Node = table('Node', definition)

  test('update', () => {
    const query = builder.update(Node).set({
      nullable: null,
      required: 3,
      withDefault: sql<number>`${Node.required} + 1`
    })
    test.equal(
      emit(query),
      'update "Node" set "withDefault" = "Node"."required" + 1, "required" = 3, "nullable" = null'
    )
  })

  test('update with function', () => {
    const query = builder.update(Node).set({
      data: Functions.json_patch(Node.data, {a: 1})
    })
    test.equal(
      emit(query),
      'update "Node" set "data" = json_patch("Node"."data", {"a":1})'
    )
  })

  test('returning', () => {
    const db = new PostgresQueryBuilder()
    const query = db.update(Node).set({required: 3}).returning(Node.id)
    test.equal(emit(query), 'update "Node" set "required" = 3 returning "id"')

    db.$query({
      insert: Node,
      returning: Node.id
    })
  })

  test('update from', () => {
    const Target = table('Target', {id: integer(), value: integer()})
    const Source = table('Source', {id: integer(), value: integer()})
    const build = (db: Builder<any>) =>
      db
        .update(Target)
        .set({value: Source.value})
        .from(Source)
        .where(eq(Target.id, Source.id))

    test.equal(
      sqliteDialect.inline(build(new SqliteQueryBuilder())),
      'update "Target" set "value" = "Source"."value" from "Source" where "Target"."id" = "Source"."id"'
    )
    test.equal(
      postgresDialect.inline(build(new PostgresQueryBuilder())),
      'update "Target" set "value" = "Source"."value" from "Source" where "Target"."id" = "Source"."id"'
    )
    test.equal(
      mysqlDialect.inline(build(new MysqlQueryBuilder())),
      'update `Target` join `Source` set `value` = `Source`.`value` where `Target`.`id` = `Source`.`id`'
    )
    test.equal(
      postgresDialect.inline(
        build(new PostgresQueryBuilder()).returning({
          id: Target.id,
          sourceValue: Source.value
        })
      ),
      'update "Target" set "value" = "Source"."value" from "Source" where "Target"."id" = "Source"."id" returning "Target"."id", "Source"."value" as "sourceValue"'
    )
  })

  test('correlated single-query expressions', () => {
    const Target = table('Target', {id: integer(), value: integer()})
    const Source = table('Source', {id: integer(), value: integer()})
    const build = (db: Builder<any>) => {
      const value = db.$query({
        select: Source.value,
        from: Source,
        where: eq(Source.id, Target.id),
        limit: 1
      })
      return db.update(Target).set({value}).where(eq(Target.value, value))
    }

    test.equal(
      sqliteDialect.inline(build(new SqliteQueryBuilder())),
      'update "Target" set "value" = (select "Source"."value" from "Source" where "Source"."id" = "Target"."id" limit 1) where "Target"."value" = (select "Source"."value" from "Source" where "Source"."id" = "Target"."id" limit 1)'
    )
    test.equal(
      postgresDialect.inline(build(new PostgresQueryBuilder())),
      'update "Target" set "value" = (select "Source"."value" from "Source" where "Source"."id" = "Target"."id" limit 1) where "Target"."value" = (select "Source"."value" from "Source" where "Source"."id" = "Target"."id" limit 1)'
    )
    test.equal(
      mysqlDialect.inline(build(new MysqlQueryBuilder())),
      'update `Target` set `value` = (select `Source`.`value` from `Source` where `Source`.`id` = `Target`.`id` limit 1) where `Target`.`value` = (select `Source`.`value` from `Source` where `Source`.`id` = `Target`.`id` limit 1)'
    )
  })
})
