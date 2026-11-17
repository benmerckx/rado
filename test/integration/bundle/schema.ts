import {alias, many, one, relate} from '#/index.ts'
import * as post from './Post.ts'
import * as user from './User.ts'

const links = many(post.PostTag, post.Post, {postId: 'id'})
const up = alias(user.Node, 'BundleParent')
const parent = one(up, user.Node, {id: 'parentId'})

export const User = relate(user.User, {
  posts: many(post.Post, user.User, {authorId: 'id'})
})

export const Post = relate(post.Post, {
  author: one(user.User, post.Post, {id: 'authorId'}).notNull(),
  links,
  tags: many(post.Tag, links, {id: 'tagId'})
})

export const Node = relate(user.Node, {parent})

export const Parent = relate(up, {parent: parent.alias(user.Node, up)})

export const {Tag, PostTag} = post
