import {suite} from '@alinea/suite'
import {table} from '@/core/Table.ts'
import {columns, desc, eq, many, one, sql} from '@/index.ts'
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
  posts: many(posts, {from: users.id, to: posts.authorId}),
  groups: many(groups, {
    from: users.id,
    through: {
      table: usersToGroups,
      from: usersToGroups.userId,
      to: usersToGroups.groupId
    },
    to: groups.id
  }),
  invitee: one(users, {from: users.invitedBy, to: users.id})
}

const Post = {
  ...posts,
  author: one(users, {from: posts.authorId, to: users.id}),
  comments: many(comments, {
    from: posts.id,
    to: comments.postId
  })
}

async function createDb() {
  const {'bun:sqlite': connect} = await import('@/driver.ts')
  const {Database} = await import('bun:sqlite')
  const db = connect(new Database(':memory:'))
  await db.create(users, posts, comments, groups, usersToGroups)
  return db
}

function typeChecks(db: Awaited<ReturnType<typeof createDb>>) {
  // @ts-expect-error ORM helpers require a table or spread-table model
  db.find({from: {}})
  // @ts-expect-error ORM writes require a table or spread-table model
  db.save({}, {})
  // @ts-expect-error load only accepts a direct relation function
  db.load(User.posts.select({title: Post.title}), 1)
  User.posts.count()
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
    const found = await db.first(User, {
      where: eq(User.id, saved.id)
    })
    test.equal(found?.name, 'Ada')
    const missing = await db.first(User, {
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
    const found = await db.first(User, {
      where: eq(User.id, saved.id),
      select: {name: User.name, posts: User.posts()}
    })
    test.equal(found?.name, 'Ada')
    test.equal(found?.posts.length, 1)
    const many = await db.find(User, {where: eq(User.name, 'Ada')})
    test.equal(many.length, 1)
    const first = await db.first(User, {where: eq(User.name, 'Ada')})
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
    const found = await db.first(Post, {
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
    const found = await db.first(User, {
      where: eq(User.id, ada.id),
      select: {
        posts: User.posts
          .select({title: Post.title})
          .innerJoin(comments, eq(comments.postId, Post.id))
          .orderBy(desc(Post.title))
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

  test('self relation scopes can select from both sides', async () => {
    const nodes = table('node', {
      id: id(),
      parentId: integer().references((): any => nodes.id),
      name: text().notNull()
    })
    const Node = {
      ...nodes,
      parent: one(nodes, {from: nodes.parentId, to: nodes.id})
    }
    const db = await createDb()
    await db.create(nodes)
    const root = await db.save(Node, {name: 'Root'})
    const child = await db.save(Node, {name: 'Child', parentId: root.id})
    const found = await db.first({
      from: Node,
      where: eq(Node.id, child.id),
      select: {
        relation: Node.parent((from, to) =>
          to.select({
            parentId: to.id,
            selfId: from.id,
            parentName: to.name,
            selfName: from.name
          })
        )
      }
    })
    test.equal(found, {
      relation: {
        parentId: root.id,
        selfId: child.id,
        parentName: 'Root',
        selfName: 'Child'
      }
    })
  })

  test('relation scopes use configured aliases', async () => {
    const AliasedUser = {
      ...users,
      posts1: many(posts, {
        from: users.id,
        to: posts.authorId,
        alias: 'posts1'
      }),
      posts2: many(posts, {from: users.id, to: posts.authorId, alias: 'posts2'})
    }
    const db = await createDb()
    const ada = await db.save(User, {
      name: 'Ada',
      posts: [{title: 'B'}, {title: 'A'}]
    })
    const found = await db.first({
      from: AliasedUser,
      where: eq(AliasedUser.id, ada.id),
      select: {
        posts1: AliasedUser.posts1((_, to) =>
          to.select({title: to.title}).orderBy(to.title)
        ),
        posts2: AliasedUser.posts2((_, to) =>
          to.select({title: to.title}).orderBy(desc(to.title))
        )
      }
    })
    test.equal(found, {
      posts1: [{title: 'A'}, {title: 'B'}],
      posts2: [{title: 'B'}, {title: 'A'}]
    })
  })

  test('relation aliases rebase select, orderBy, and raw sql', async () => {
    const AliasedUser = {
      ...users,
      posts1: many(posts, {
        from: users.id,
        to: posts.authorId,
        alias: 'posts1'
      }),
      posts2: many(posts, {from: users.id, to: posts.authorId, alias: 'posts2'})
    }
    const db = await createDb()
    const ada = await db.save(User, {
      name: 'Ada',
      posts: [{title: 'B'}, {title: 'A'}]
    })
    const found = await db.first({
      from: AliasedUser,
      where: eq(AliasedUser.id, ada.id),
      select: {
        posts1: AliasedUser.posts1
          .select({title: sql<string>`${posts.title}`})
          .where(sql<boolean>`${posts.title} is not null`)
          .orderBy(posts.title),
        posts2: AliasedUser.posts2
          .select({title: posts.title})
          .orderBy(desc(sql`${posts.title}`))
      }
    })
    test.equal(found, {
      posts1: [{title: 'A'}, {title: 'B'}],
      posts2: [{title: 'B'}, {title: 'A'}]
    })
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

  test('loads a relation by key', async () => {
    const db = await createDb()
    const ada = await db.save(User, {
      name: 'Ada',
      posts: [{title: 'Hello'}, {title: 'World'}]
    })
    const posts = await db.load(User.posts, ada.id)
    test.equal(
      posts.map(post => post.title),
      ['Hello', 'World']
    )
  })

  test('load rejects refined relations', async () => {
    const db = await createDb()
    let error: Error | undefined
    try {
      await db.load(User.posts.select({title: Post.title}) as any, 1)
    } catch (caught) {
      error = caught as Error
    }
    test.equal(error?.message, 'db.load() only accepts a direct relation')
  })

  test('many-to-many relations use explicit through config', async () => {
    const db = await createDb()
    const ada = await db.save(User, {
      name: 'Ada',
      groups: [{name: 'Admins'}, {name: 'Editors'}]
    })
    const found = await db.first({
      from: User,
      where: eq(User.id, ada.id),
      select: {
        name: User.name,
        groups: User.groups.select({name: groups.name})
      }
    })
    const loaded = await db.load(User.groups, ada.id)
    test.equal(found, {
      name: 'Ada',
      groups: [{name: 'Admins'}, {name: 'Editors'}]
    })
    test.equal(
      loaded.map(group => group.name),
      ['Admins', 'Editors']
    )
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

  test('to-one relations set and reassign', async () => {
    const db = await createDb()
    const ada = await db.save(User, {name: 'Ada'})
    const grace = await db.save(User, {name: 'Grace'})
    const post = await db.save(Post, {
      title: 'Hello',
      author: {id: ada.id}
    })
    test.equal(post.authorId, ada.id)
    const moved = await db.save(Post, {id: post.id, author: {id: grace.id}})
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

  test('relations can be declared inside a table definition', async () => {
    const Profile = table('profile', {
      id: id(),
      userId: integer()
        .notNull()
        .references(() => users.id),
      label: text().notNull(),
      user: one(users, self => ({
        from: self.userId,
        to: users.id,
        alias: 'profile_user'
      }))
    })
    const db = await createDb()
    await db.create(Profile)
    const ada = await db.save(User, {name: 'Ada'})
    await db.save(Profile, {userId: ada.id, label: 'main'})
    const [profile] = await db.select().from(Profile)
    const found = await db.first({
      from: Profile,
      select: {
        label: Profile.label,
        user: Profile.user.select({name: users.name})
      }
    })
    test.equal(found, {label: 'main', user: {name: 'Ada'}})
    const user = await db.load(Profile.user, profile.userId)
    test.equal(user?.name, 'Ada')
  })

  test('inline relation callbacks are bound to table fields', async () => {
    const InlineUser = table('user', {
      id: id(),
      name: text().notNull(),
      posts: many(posts, self => ({
        from: self.id,
        to: posts.authorId,
        alias: 'inline_post'
      }))
    })
    const db = await createDb()
    const ada = await db.save(User, {
      name: 'Ada',
      posts: [{title: 'Hello'}, {title: 'World'}]
    })
    const found = await db.first({
      from: InlineUser,
      where: eq(InlineUser.id, ada.id),
      select: {
        name: InlineUser.name,
        postCount: InlineUser.posts.count(),
        posts: InlineUser.posts.select({title: posts.title})
      }
    })
    test.equal(found, {
      name: 'Ada',
      postCount: 2,
      posts: [{title: 'Hello'}, {title: 'World'}]
    })
  })
})
