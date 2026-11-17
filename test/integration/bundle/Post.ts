import {table} from '#/index.ts'
import {id, integer, text} from '#/universal.ts'
import {User} from './User.ts'

export const Post = table('BundlePost', {
  id: id(),
  authorId: integer().notNull().references(User.id),
  title: text().notNull()
})

export const Tag = table('BundleTag', {
  id: id(),
  name: text().notNull()
})

export const PostTag = table('BundlePostTag', {
  postId: integer().notNull(),
  tagId: integer().notNull()
})
