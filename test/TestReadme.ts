import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, create, table} from '../src/index.js'
import {count} from '../src/sqlite.js'
import {connect} from './DbSuite.js'

const User = table({
  user: class {
    id = column.integer().primaryKey()
    username = column.string()

    posts() {
      return Post({userId: this.id})
    }
  }
})

const Post = table({
  post: class {
    id = column.integer().primaryKey()
    userId = column.integer().references(() => User.id)
    content = column.string()

    author() {
      return User({id: this.userId}).first()
    }

    tags() {
      return Tag({id: PostTags.tagId}).innerJoin(PostTags({postId: this.id}))
    }
  }
})

const Tag = table({
  tag: class {
    id = column.integer().primaryKey()
    name = column.string()
  }
})

const PostTags = table({
  post_tag: class {
    postId = column.integer().references(() => Post.id)
    tagId = column.integer().references(() => Tag.id)
  }
})

test('Get stuff', async () => {
  const db = await connect()
  await db(create(User, Post, Tag, PostTags))
  const user = await db(User().insertOne({username: 'Mario'}))
  await db(Tag().insertAll([{name: 'hello'}, {name: 'world'}]))
  const post = await db(
    Post().insertOne({
      content: 'Hello world',
      userId: user.id
    })
  )
  await db(
    PostTags().insertSelect(
      Tag().select({
        postId: post.id,
        tagId: Tag.id
      })
    )
  )
  const postsResult = await db(
    Post().select({
      ...Post,
      author: Post.author(),
      tags: Post.tags().select(Tag.name)
    })
  )
  const userResult = await db(
    User({id: user.id})
      .select({
        author: User.username,
        posts: User.posts().select({
          ...Post,
          tags: Post.tags().select(Tag.name)
        })
      })
      .first()
  )
  assert.equal(userResult, {
    author: 'Mario',
    posts: [
      {
        content: 'Hello world',
        id: post.id,
        userId: user.id,
        tags: ['hello', 'world']
      }
    ]
  })
  const pt = PostTags().as('pt')
  const example = await db(
    Post()
      .select({
        ...Post,
        author: Post.author().select(User.username),
        tags: Post.tags().select({
          count: pt({tagId: Tag.id}).select(count()).first(),
          name: Tag.name
        })
      })
      .first()
  )
  assert.equal(example, {
    id: 1,
    userId: 1,
    content: 'Hello world',
    author: 'Mario',
    tags: [
      {count: 1, name: 'hello'},
      {count: 1, name: 'world'}
    ]
  })
})

test.run()
