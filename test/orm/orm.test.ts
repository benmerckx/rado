import {suite} from '@alinea/suite'
import {table} from '@/core/Table.ts'
import {columns, eq, many, one, sql} from '@/index.ts'
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
  posts: many(posts, {onRemove: 'delete'}),
  invitee: one(users, {fields: [users.invitedBy], references: [users.id]}),
  groups: many(groups, {through: usersToGroups, onRemove: 'detach'})
}

const Post = {
  ...posts,
  author: one(users),
  comments: many(comments, {
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

function typeChecks(db: Awaited<ReturnType<typeof createDb>>) {
  // @ts-expect-error ORM helpers require a table or spread-table model
  db.find({from: {}})
  // @ts-expect-error ORM writes require a table or spread-table model
  db.save({}, {})
}

void typeChecks

suite(import.meta, test => {
  test('save inserts a graph and wires foreign keys', async () => {
    const db = await createDb()
    const saved = await db.save(User, {
      name: 'Ada',
      posts: [{title: 'Hello'}, {title: 'World', published: true}]
    })
    test.equal(saved.name, 'Ada')
    test.equal(saved.loginCount, 0)
    test.equal(saved.posts.length, 2)
    test.equal(saved.posts[0].authorId, saved.id)
    test.equal(saved.posts[1].published, true)
  })

  test('first finds a row by primary key', async () => {
    const db = await createDb()
    const saved = await db.save(User, {name: 'Ada'})
    const found = await db.first({
      from: User,
      where: eq(User.id, saved.id)
    })
    test.equal(found?.name, 'Ada')
    const missing = await db.first({
      from: User,
      where: eq(User.id, 999)
    })
    test.equal(missing, null)
  })

  test('database exposes orm helpers', async () => {
    const db = await createDb()
    const saved = await db.save(User, {
      name: 'Ada',
      posts: [{title: 'Hello'}]
    })
    const found = await db.first({
      from: User,
      where: eq(User.id, saved.id),
      select: {name: User.name, posts: User.posts}
    })
    test.equal(found?.name, 'Ada')
    test.equal(found?.posts.length, 1)
    const many = await db.find({from: User, where: eq(User.name, 'Ada')})
    test.equal(many.length, 1)
    const first = await db.first({from: User, where: eq(User.name, 'Ada')})
    test.equal(first?.id, saved.id)
    test.equal(await db.count({from: User}), 1)
    await db.destroy(User, saved.id)
    test.equal(await db.count({from: User}), 0)
  })

  test('select shapes load relations', async () => {
    const db = await createDb()
    const ada = await db.save(User, {
      name: 'Ada',
      posts: [{title: 'Hello'}, {title: 'World'}]
    })
    await db.save(User, {name: 'Grace'})
    const found = await db.first({
      from: User,
      where: eq(User.id, ada.id),
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
    const ada = await db.save(User, {name: 'Ada'})
    const post = await db.save(Post, {
      title: 'Hello',
      authorId: ada.id,
      comments: [{body: 'Nice', authorId: ada.id}]
    })
    const found = await db.first({
      from: Post,
      where: eq(Post.id, post.id),
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

  test('relation queries support joins and modifiers', async () => {
    const db = await createDb()
    const ada = await db.save(User, {name: 'Ada'})
    await db.save(Post, {
      title: 'No comment',
      authorId: ada.id
    })
    await db.save(Post, {
      title: 'With comment',
      authorId: ada.id,
      comments: [{body: 'Nice', authorId: ada.id}]
    })
    const found = await db.first({
      from: User,
      where: eq(User.id, ada.id),
      select: {
        posts: User.posts
          .select({title: Post.title})
          .innerJoin(comments, eq(comments.postId, Post.id))
          .orderBy(sql`${Post.title} desc`)
          .limit(1)
      }
    })
    test.equal(found, {posts: [{title: 'With comment'}]})
  })

  test('self relation', async () => {
    const db = await createDb()
    const grace = await db.save(User, {name: 'Grace'})
    const ada = await db.save(User, {name: 'Ada', invitedBy: grace.id})
    const found = await db.first({
      from: User,
      where: eq(User.id, ada.id),
      select: {
        name: User.name,
        invitee: User.invitee.select({name: User.name})
      }
    })
    test.equal(found, {name: 'Ada', invitee: {name: 'Grace'}})
  })

  test('find with relation filters', async () => {
    const db = await createDb()
    await db.save(User, {
      name: 'Ada',
      posts: [{title: 'Hi', published: true}]
    })
    await db.save(User, {name: 'Grace', posts: [{title: 'Draft'}]})
    await db.save(User, {name: 'Lin'})
    const authors = await db.find({
      from: User,
      select: {name: User.name},
      where: User.posts.some(eq(Post.published, true))
    })
    test.equal(authors, [{name: 'Ada'}])
    const lurkers = await db.find({
      from: User,
      select: {name: User.name},
      where: User.posts.none()
    })
    test.equal(lurkers, [{name: 'Lin'}])
  })

  test('find with pagination and count', async () => {
    const db = await createDb()
    await db.saveMany(User, [{name: 'Ada'}, {name: 'Grace'}, {name: 'Lin'}])
    const page = await db.find({
      from: User,
      select: {name: User.name},
      orderBy: sql`${User.name} asc`,
      limit: 2,
      offset: 1
    })
    test.equal(page, [{name: 'Grace'}, {name: 'Lin'}])
    const total = await db.count({from: User})
    test.equal(total, 3)
  })

  test('save updates rows with a primary key', async () => {
    const db = await createDb()
    const ada = await db.save(User, {name: 'Ada'})
    const updated = await db.save(User, {
      id: ada.id,
      email: 'ada@example.com'
    })
    test.equal(updated.name, 'Ada')
    test.equal(updated.email, 'ada@example.com')
  })

  test('save rejects an update of a missing row', async () => {
    const db = await createDb()
    let error: Error | undefined
    try {
      await db.save(User, {id: 42, name: 'Nobody'})
    } catch (caught) {
      error = caught as Error
    }
    test.ok(error?.message.includes('primary key'))
    test.equal(await db.count({from: User}), 0)
  })

  test('builder ops execute with the save', async () => {
    const db = await createDb()
    const ada = await db.save(User, {
      name: 'Ada',
      email: 'ada@example.com',
      posts: [{title: 'Old post'}]
    })
    const updated = await db
      .save(User, {id: ada.id})
      .set({name: 'Ada Lovelace'})
      .increment(User.loginCount, 2)
      .unset(User.email)
      .add(User.posts, {title: 'New post'})
      .remove(User.posts, ada.posts[0])
    test.equal(updated.name, 'Ada Lovelace')
    test.equal(updated.loginCount, 2)
    test.equal(updated.email, null)
    const titles = await db.find({
      from: Post,
      select: {title: Post.title}
    })
    test.equal(titles, [{title: 'New post'}]) // onRemove: delete
  })

  test('reconcile a to-many relation', async () => {
    const db = await createDb()
    const ada = await db.save(User, {
      name: 'Ada',
      posts: [{title: 'Keep'}, {title: 'Drop'}]
    })
    await db
      .save(User, {id: ada.id})
      .set(User.posts, [{id: ada.posts[0].id}, {title: 'Fresh'}])
    const titles = await db.find({
      from: Post,
      select: {title: Post.title},
      orderBy: sql`${Post.id} asc`
    })
    test.equal(titles, [{title: 'Keep'}, {title: 'Fresh'}])
  })

  test('many-to-many through a junction table', async () => {
    const db = await createDb()
    const admins = await db.save(groups, {name: 'admins'})
    const ada = await db.save(User, {
      name: 'Ada',
      groups: [{id: admins.id}, {name: 'editors'}]
    })
    test.equal(ada.groups.length, 2)
    const found = await db.first({
      from: User,
      where: eq(User.id, ada.id),
      select: {name: User.name, groups: User.groups.select({name: groups.name})}
    })
    test.equal(found, {
      name: 'Ada',
      groups: [{name: 'admins'}, {name: 'editors'}]
    })
    // attaching twice does not duplicate junction rows
    await db.save(User, {id: ada.id, groups: [{id: admins.id}]})
    const junctions = await db.count({from: usersToGroups})
    test.equal(junctions, 2)
    // reconcile detaches junction rows, not group rows
    await db.save(User, {id: ada.id}).set(User.groups, [{id: admins.id}])
    test.equal(await db.count({from: usersToGroups}), 1)
    test.equal(await db.count({from: groups}), 2)
  })

  test('to-one relations set and reassign', async () => {
    const db = await createDb()
    const ada = await db.save(User, {name: 'Ada'})
    const grace = await db.save(User, {name: 'Grace'})
    const post = await db.save(Post, {
      title: 'Hello',
      author: {id: ada.id}
    })
    test.equal(post.authorId, ada.id)
    const moved = await db
      .save(Post, {id: post.id})
      .set(Post.author, {id: grace.id})
    test.equal(moved.authorId, grace.id)
  })

  test('destroy by primary key or entity', async () => {
    const db = await createDb()
    const ada = await db.save(User, {name: 'Ada'})
    const grace = await db.save(User, {name: 'Grace'})
    await db.destroy(User, ada.id)
    await db.destroy(User, grace)
    test.equal(await db.count({from: User}), 0)
  })

  test('columns() excludes relations', () => {
    const cols = columns(User)
    test.equal(Object.keys(cols), [
      'id',
      'name',
      'email',
      'loginCount',
      'invitedBy'
    ])
  })
})
