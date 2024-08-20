import {foreignKey, primaryKey, table, unique} from '@/index.ts'
import {boolean, id, integer, json, text} from '@/universal.ts'

export const Node = table('Node', {
  id: id().notNull(),
  textField: text().notNull(),
  bool: boolean()
})

export const User = table('User', {
  id: id(),
  name: text().notNull()
})

export const Post = table('Post', {
  id: id(),
  userId: integer().notNull(),
  title: text().notNull()
})

export const TableA = table('TableA', {
  id: id()
})

export const TableB = table(
  'TableB',
  {
    isUnique: integer().unique(),
    hasRef: integer().references(TableA.id),
    colA: integer(),
    colB: integer().unique()
  },
  TableB => {
    return {
      uniqueA: unique().on(TableB.colA),
      multiPk: primaryKey(TableB.colA, TableB.colB),
      multiRef: foreignKey(TableB.colA).references(TableA.id)
    }
  }
)

export const WithJson = table('WithJson', {
  id: id(),
  data: json<{
    str: string
    sub: {
      field: string
    }
    arr: Array<number>
  }>()
})
