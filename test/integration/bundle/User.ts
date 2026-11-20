import {table} from '#/index.ts'
import {id, integer, text} from '#/universal.ts'

export const User = table('BundleUser', {
  id: id(),
  name: text().notNull()
})

export const Node = table('BundleNode', {
  id: id(),
  parentId: integer(),
  name: text().notNull()
})
