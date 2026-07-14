import {suite} from '@alinea/suite'
import {sql} from '#/core/Sql.ts'
import {mysqlDialect} from '#/mysql/dialect.ts'
import {sqliteDialect} from '#/sqlite/dialect.ts'

const test = suite(import.meta)

test('mysql inline string escapes backslashes before quotes', () => {
  const value = `${String.fromCharCode(92, 39)} OR 1=1 -- `
  test.equal(mysqlDialect.inline(sql.inline(value)), `'\\\\'' OR 1=1 -- '`)
})

test('mysql json path quotes string segments', () => {
  const path = sql.jsonPath({
    target: sql.identifier('doc'),
    segments: ['a[0]', 'x.y'],
    asSql: true
  })
  test.equal(mysqlDialect.inline(path), '`doc`->>\'$."a[0]"."x.y"\'')
})

test('sqlite json path quotes string segments', () => {
  const path = sql.jsonPath({
    target: sql.identifier('doc'),
    segments: ['a[0]', 'x.y'],
    asSql: true
  })
  test.equal(sqliteDialect.inline(path), '"doc"->>\'$."a[0]"."x.y"\'')
})

test('sql query with no active chunks emits empty string', () => {
  const empty = sql.query({a: false, b: false})

  test.equal(sqliteDialect.inline(empty), '')
  test.equal(sqliteDialect.inline(sql.join([sql`x`, empty])), 'x')
})
