import {alias, many, one, relate} from '#/index.ts'
import * as post from './Post.ts'
import * as user from './User.ts'

const links = many(post.PostTag, {postId: post.Post.id})
const up = alias(user.Node, 'BundleParent')
const parent = one(up, {id: user.Node.parentId})

export const User = relate(user.User, {
  posts: many(post.Post, {authorId: user.User.id})
})

export const Post = relate(post.Post, {
  author: one(user.User, {id: post.Post.authorId}).notNull(),
  links,
  tags: links.many(post.Tag, {id: post.PostTag.tagId})
})

export const Node = relate(user.Node, {parent})

export const Parent = relate(up, {parent: parent.alias(user.Node, up)})

export const {Tag, PostTag} = post
