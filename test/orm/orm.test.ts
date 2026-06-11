import {suite} from '@alinea/suite'
import {table} from '@/core/Table.ts'
import {eq, sql} from '@/index.ts'
import * as orm from '@/orm.ts'
import {boolean, id, integer, text} from '@/universal.ts'

const users = table('user', {
  id: id(),
  name: text().notNull(),
  email: text(),
  loginCount: integer().notNull().default(0),
  invitedBy: integer().references((): any => users.id)
})

const posts = table('post', {
  id: id(),
  authorId: integer()
    .notNull()
    .references(() => users.id),
  title: text().notNull(),
  published: boolean().notNull().default(false)
})

const comments = table('comment', {
  id: id(),
  postId: integer()
    .notNull()
    .references(() => posts.id),
  authorId: integer()
    .notNull()
    .references(() => users.id),
  body: text().notNull()
})

const groups = table('group', {
  id: id(),
  name: text().notNull()
})

const usersToGroups = table('users_to_groups', {
  userId: integer()
    .notNull()
    .references(() => users.id),
  groupId: integer()
    .notNull()
    .references(() => groups.id)
})

const User = {
  ...users,
  posts: orm.many(posts, {onRemove: 'delete'}),
  invitee: orm.one(users, {fields: [users.invitedBy], references: [users.id]}),
  groups: orm.many(groups, {through: usersToGroups, onRemove: 'detach'})
}

const Post = {
  ...posts,
  author: orm.one(users),
  comments: orm.many(comments, {
    fields: [comments.postId],
    references: [posts.id],
    onRemove: 'delete'
  })
}

async function createDb() {
  const {'sql.js': connect} = await import('@/driver.ts')
  const {default: init} = await import('sql.js')
  const {Database} = await init()
  const db = connect(new Database())
  await db.create(users, posts, comments, groups, usersToGroups)
  return db
}

suite(import.meta, test => {
  test('save inserts a graph and wires foreign keys', async () => {
    const db = await createDb()
    const saved = await orm.save(db, User, {
      name: 'Ada',
      posts: [{title: 'Hello'}, {title: 'World', published: true}]
    })
    test.equal(saved.name, 'Ada')
    test.equal(saved.loginCount, 0)
    test.equal(saved.posts.length, 2)
    test.equal(saved.posts[0].authorId, saved.id)
    test.equal(saved.posts[1].published, true)
  })

  test('get by primary key', async () => {
    const db = await createDb()
    const saved = await orm.save(db, User, {name: 'Ada'})
    const found = await orm.get(db, {from: User, id: saved.id})
    test.equal(found?.name, 'Ada')
    const missing = await orm.get(db, {from: User, id: 999})
    test.equal(missing, null)
  })

  test('select shapes load relations', async () => {
    const db = await createDb()
    const ada = await orm.save(db, User, {
      name: 'Ada',
      posts: [{title: 'Hello'}, {title: 'World'}]
    })
    await orm.save(db, User, {name: 'Grace'})
    const found = await orm.get(db, {
      from: User,
      id: ada.id,
      select: {
        name: User.name,
        posts: User.posts.select({title: Post.title}),
        postCount: User.posts.count()
      }
    })
    test.equal(found, {
      name: 'Ada',
      posts: [{title: 'Hello'}, {title: 'World'}],
      postCount: 2
    })
  })

  test('nested relation shapes', async () => {
    const db = await createDb()
    const ada = await orm.save(db, User, {name: 'Ada'})
    const post = await orm.save(db, Post, {
      title: 'Hello',
      authorId: ada.id,
      comments: [{body: 'Nice', authorId: ada.id}]
    })
    const found = await orm.get(db, {
      from: Post,
      id: post.id,
      select: {
        title: Post.title,
        author: Post.author.select({name: User.name}),
        comments: Post.comments.select({body: comments.body})
      }
    })
    test.equal(found, {
      title: 'Hello',
      author: {name: 'Ada'},
      comments: [{body: 'Nice'}]
    })
  })

  test('self relation', async () => {
    const db = await createDb()
    const grace = await orm.save(db, User, {name: 'Grace'})
    const ada = await orm.save(db, User, {name: 'Ada', invitedBy: grace.id})
    const found = await orm.get(db, {
      from: User,
      id: ada.id,
      select: {
        name: User.name,
        invitee: User.invitee.select({name: User.name})
      }
    })
    test.equal(found, {name: 'Ada', invitee: {name: 'Grace'}})
  })

  test('find with relation filters', async () => {
    const db = await createDb()
    await orm.save(db, User, {name: 'Ada', posts: [{title: 'Hi', published: true}]})
    await orm.save(db, User, {name: 'Grace', posts: [{title: 'Draft'}]})
    await orm.save(db, User, {name: 'Lin'})
    const authors = await orm.find(db, {
      from: User,
      select: {name: User.name},
      where: User.posts.some(eq(Post.published, true))
    })
    test.equal(authors, [{name: 'Ada'}])
    const lurkers = await orm.find(db, {
      from: User,
      select: {name: User.name},
      where: User.posts.none()
    })
    test.equal(lurkers, [{name: 'Lin'}])
  })

  test('find with pagination and count', async () => {
    const db = await createDb()
    await orm.saveMany(db, User, [
      {name: 'Ada'},
      {name: 'Grace'},
      {name: 'Lin'}
    ])
    const page = await orm.find(db, {
      from: User,
      select: {name: User.name},
      orderBy: sql`${User.name} asc`,
      limit: 2,
      offset: 1
    })
    test.equal(page, [{name: 'Grace'}, {name: 'Lin'}])
    const total = await orm.count(db, {from: User})
    test.equal(total, 3)
  })

  test('save updates rows with a primary key', async () => {
    const db = await createDb()
    const ada = await orm.save(db, User, {name: 'Ada'})
    const updated = await orm.save(db, User, {id: ada.id, email: 'ada@example.com'})
    test.equal(updated.name, 'Ada')
    test.equal(updated.email, 'ada@example.com')
  })

  test('save rejects an update of a missing row', async () => {
    const db = await createDb()
    let error: Error | undefined
    try {
      await orm.save(db, User, {id: 42, name: 'Nobody'})
    } catch (caught) {
      error = caught as Error
    }
    test.ok(error?.message.includes('primary key'))
    test.equal(await orm.count(db, {from: User}), 0)
  })

  test('builder ops execute with the save', async () => {
    const db = await createDb()
    const ada = await orm.save(db, User, {
      name: 'Ada',
      email: 'ada@example.com',
      posts: [{title: 'Old post'}]
    })
    const updated = await orm
      .save(db, User, {id: ada.id})
      .set({name: 'Ada Lovelace'})
      .increment(User.loginCount, 2)
      .unset(User.email)
      .add(User.posts, {title: 'New post'})
      .remove(User.posts, ada.posts[0])
    test.equal(updated.name, 'Ada Lovelace')
    test.equal(updated.loginCount, 2)
    test.equal(updated.email, null)
    const titles = await orm.find(db, {
      from: Post,
      select: {title: Post.title}
    })
    test.equal(titles, [{title: 'New post'}]) // onRemove: delete
  })

  test('reconcile a to-many relation', async () => {
    const db = await createDb()
    const ada = await orm.save(db, User, {
      name: 'Ada',
      posts: [{title: 'Keep'}, {title: 'Drop'}]
    })
    await orm
      .save(db, User, {id: ada.id})
      .set(User.posts, [{id: ada.posts[0].id}, {title: 'Fresh'}])
    const titles = await orm.find(db, {
      from: Post,
      select: {title: Post.title},
      orderBy: sql`${Post.id} asc`
    })
    test.equal(titles, [{title: 'Keep'}, {title: 'Fresh'}])
  })

  test('many-to-many through a junction table', async () => {
    const db = await createDb()
    const admins = await orm.save(db, groups, {name: 'admins'})
    const ada = await orm.save(db, User, {
      name: 'Ada',
      groups: [{id: admins.id}, {name: 'editors'}]
    })
    test.equal(ada.groups.length, 2)
    const found = await orm.get(db, {
      from: User,
      id: ada.id,
      select: {name: User.name, groups: User.groups.select({name: groups.name})}
    })
    test.equal(found, {name: 'Ada', groups: [{name: 'admins'}, {name: 'editors'}]})
    // attaching twice does not duplicate junction rows
    await orm.save(db, User, {id: ada.id, groups: [{id: admins.id}]})
    const junctions = await orm.count(db, {from: usersToGroups})
    test.equal(junctions, 2)
    // reconcile detaches junction rows, not group rows
    await orm.save(db, User, {id: ada.id}).set(User.groups, [{id: admins.id}])
    test.equal(await orm.count(db, {from: usersToGroups}), 1)
    test.equal(await orm.count(db, {from: groups}), 2)
  })

  test('to-one relations set and reassign', async () => {
    const db = await createDb()
    const ada = await orm.save(db, User, {name: 'Ada'})
    const grace = await orm.save(db, User, {name: 'Grace'})
    const post = await orm.save(db, Post, {title: 'Hello', author: {id: ada.id}})
    test.equal(post.authorId, ada.id)
    const moved = await orm.save(db, Post, {id: post.id}).set(Post.author, {id: grace.id})
    test.equal(moved.authorId, grace.id)
  })

  test('destroy by primary key or entity', async () => {
    const db = await createDb()
    const ada = await orm.save(db, User, {name: 'Ada'})
    const grace = await orm.save(db, User, {name: 'Grace'})
    await orm.destroy(db, User, ada.id)
    await orm.destroy(db, User, grace)
    test.equal(await orm.count(db, {from: User}), 0)
  })

  test('columns() excludes relations', () => {
    const cols = orm.columns(User)
    test.equal(Object.keys(cols), ['id', 'name', 'email', 'loginCount', 'invitedBy'])
  })
})
