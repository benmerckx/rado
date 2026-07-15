import {suite} from '@alinea/suite'
import {isNotNull} from '#/core/expr/Conditions.ts'
import {index, uniqueIndex} from '#/core/Index.ts'
import {getData, getCreate} from '#/core/Internal.ts'
import {sql} from '#/core/Sql.ts'
import {table} from '#/core/Table.ts'
import {integer, text} from '#/sqlite/columns.ts'
import {emit} from '../TestUtils.ts'

suite(import.meta, test => {
  const Article = table('Article', {
    id: integer().primaryKey(),
    title: text()
  })

  test('plain index', () => {
    const statement = getData(index().on(Article.title)).toSql(
      'Article',
      'byTitle',
      false
    )
    test.equal(emit(statement), 'create index "byTitle" on "Article" ("title")')
  })

  test('index options', () => {
    const statement = getData(
      uniqueIndex()
        .on(Article.title)
        .concurrently()
        .only()
        .using(sql`gin`)
        .desc()
        .nullsLast()
        .where(isNotNull(Article.title))
    ).toSql('Article', 'byTitle', true)

    test.equal(
      emit(statement),
      'create unique index concurrently if not exists "byTitle" on only "Article" using gin ("title" desc nulls last) where "title" is not null'
    )
  })

  test('table create includes configured index options', () => {
    const IndexedArticle = table(
      'IndexedArticle',
      {
        id: integer().primaryKey(),
        title: text()
      },
      self => ({
        byTitle: index()
          .on(self.title)
          .using(sql`btree`)
          .asc()
          .nullsFirst()
          .where(isNotNull(self.title))
      })
    )

    test.equal(
      emit(getCreate(IndexedArticle)[1]),
      'create index "byTitle" on "IndexedArticle" using btree ("title" asc nulls first) where "title" is not null'
    )
  })
})
