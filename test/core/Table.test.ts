import {suite} from '@alinea/suite'
import {foreignKey, primaryKey, unique} from '#/core/Constraint.ts'
import {index} from '#/core/Index.ts'
import {getCreate} from '#/core/Internal.ts'
import {table} from '#/core/Table.ts'
import {integer, text} from '#/sqlite/columns.ts'
import {emit} from '../TestUtils.ts'

suite(import.meta, test => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  test('format table and column name', () => {
    test.equal(emit(Node.id), '"Node"."id"')
  })

  test('object config uses keys as fallback names', () => {
    const Author = table('Author', {
      id: integer().primaryKey()
    })
    const Article = table(
      'Article',
      {
        id: integer(),
        authorId: integer(),
        title: text()
      },
      self => ({
        byTitle: index().on(self.title),
        articlePk: primaryKey(self.id),
        authorFk: foreignKey(self.authorId).references(Author.id),
        titleUnique: unique().on(self.title)
      })
    )

    test.equal(
      emit(getCreate(Article)[0]),
      'create table "Article" ("id" integer, "authorId" integer, "title" text, constraint "articlePk" primary key ("id"), constraint "authorFk" foreign key ("authorId") references "Author" ("id"), constraint "titleUnique" unique ("title"))'
    )
    test.equal(
      emit(getCreate(Article)[1]),
      'create index "byTitle" on "Article" ("title")'
    )
  })

  test('array config uses explicit names and allows unnamed table constraints', () => {
    const Author = table('ArrayAuthor', {
      id: integer().primaryKey()
    })
    const Article = table(
      'ArrayArticle',
      {
        id: integer(),
        authorId: integer(),
        title: text()
      },
      self => [
        index('byTitle').on(self.title),
        primaryKey({columns: [self.id]}),
        foreignKey({
          name: 'authorFk',
          columns: [self.authorId],
          foreignColumns: [Author.id]
        }),
        unique('titleUnique').on(self.title)
      ]
    )

    test.equal(
      emit(getCreate(Article)[0]),
      'create table "ArrayArticle" ("id" integer, "authorId" integer, "title" text, primary key ("id"), constraint "authorFk" foreign key ("authorId") references "ArrayAuthor" ("id"), constraint "titleUnique" unique ("title"))'
    )
    test.equal(
      emit(getCreate(Article)[1]),
      'create index "byTitle" on "ArrayArticle" ("title")'
    )
  })

  test('array config indexes require explicit names', () => {
    const Article = table(
      'UnnamedIndexArticle',
      {
        id: integer(),
        title: text()
      },
      self => [index().on(self.title)]
    )

    test.throws(() => getCreate(Article))
  })
})
