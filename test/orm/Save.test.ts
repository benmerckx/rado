import {suite} from '@alinea/suite'
import {
  createDb,
  Post,
  posts,
  postTags,
  User,
  UserGraph,
  users
} from './Fixtures.ts'

suite(import.meta, test => {
  test('save inserts one row and returns database defaults', async () => {
    const db = await createDb()
    const saved = await db.save(User, {name: 'Ada'})

    test.equal(saved, {
      id: 1,
      name: 'Ada',
      email: null,
      loginCount: 0
    })
  })

  test('save accepts arrays and preserves result cardinality', async () => {
    const db = await createDb()
    const saved = await db.save(User, [{name: 'Ada'}, {name: 'Grace'}])

    test.equal(saved, [
      {id: 1, name: 'Ada', email: null, loginCount: 0},
      {id: 2, name: 'Grace', email: null, loginCount: 0}
    ])
    test.equal(await db.save(User, []), [])
  })

  test('save updates by primary key and inserts unknown keys', async () => {
    const db = await createDb()
    const ada = await db.save(User, {name: 'Ada'})

    const updated = await db.save(User, {
      id: ada.id,
      email: 'ada@example.com'
    })
    test.equal(updated, {
      id: ada.id,
      name: 'Ada',
      email: 'ada@example.com',
      loginCount: 0
    })

    const inserted = await db.save(User, {id: 20, name: 'Lin'})
    test.equal(inserted, {
      id: 20,
      name: 'Lin',
      email: null,
      loginCount: 0
    })
  })

  test('save inserts one and many relations in dependency order', async () => {
    const db = await createDb()
    const saved = await db.save(Post, {
      title: 'Hello',
      author: {name: 'Ada'},
      comments: [{body: 'Nice'}, {body: 'Thanks'}]
    })

    test.equal(saved.author.name, 'Ada')
    test.equal(saved.authorId, saved.author.id)
    test.equal(saved.comments, [
      {id: 1, postId: saved.id, body: 'Nice'},
      {id: 2, postId: saved.id, body: 'Thanks'}
    ])
  })

  test('save recursively follows relation target models', async () => {
    const db = await createDb()
    const saved = await db.save(UserGraph, {
      name: 'Ada',
      posts: [
        {
          title: 'Hello',
          comments: [{body: 'Nested'}]
        }
      ]
    })

    test.equal(saved.posts, [
      {
        id: 1,
        authorId: saved.id,
        title: 'Hello',
        published: false,
        comments: [{id: 1, postId: 1, body: 'Nested'}]
      }
    ])
  })

  test('save inserts and reuses many-to-many relations through a join table', async () => {
    const db = await createDb()
    const saved = await db.save(Post, {
      title: 'Hello',
      author: {name: 'Ada'},
      tags: [{name: 'ORM'}, {name: 'SQL'}]
    })

    test.equal(
      saved.tags.map(tag => tag.name),
      ['ORM', 'SQL']
    )
    test.equal(await db.find(postTags), [
      {postId: saved.id, tagId: saved.tags[0].id},
      {postId: saved.id, tagId: saved.tags[1].id}
    ])

    const updated = await db.save(Post, {
      id: saved.id,
      tags: [{id: saved.tags[0].id}]
    })
    test.equal(updated.tags, [saved.tags[0]])
    test.equal(await db.count(postTags), 2)
  })

  test('save upserts supplied children without deleting omitted rows', async () => {
    const db = await createDb()
    const user = await db.save(User, {
      name: 'Ada',
      posts: [{title: 'First'}, {title: 'Untouched'}]
    })
    const updated = await db.save(User, {
      id: user.id,
      posts: [{id: user.posts[0].id, title: 'Updated'}, {title: 'Added'}]
    })

    test.equal(
      updated.posts.map(post => post.title),
      ['Updated', 'Added']
    )
    test.equal(await db.count(posts), 3)
  })

  test('save reassigns one relations while updating the parent', async () => {
    const db = await createDb()
    const post = await db.save(Post, {
      title: 'Hello',
      author: {name: 'Ada'}
    })
    const updated = await db.save(Post, {
      id: post.id,
      author: {name: 'Grace'}
    })

    test.equal(updated.title, 'Hello')
    test.equal(updated.author.name, 'Grace')
    test.equal(updated.authorId, updated.author.id)
    test.equal(await db.count(users), 2)
  })

  test('array saves are atomic', async () => {
    const db = await createDb()
    let error: unknown
    try {
      await db.save(User, [{name: 'Ada'}, {}])
    } catch (caught) {
      error = caught
    }

    test.ok(error instanceof Error)
    test.equal(await db.count(User), 0)
  })

  test('graph saves roll back parent rows when a child fails', async () => {
    const db = await createDb()
    let error: unknown
    try {
      await db.save(User, {name: 'Ada', posts: [{}]})
    } catch (caught) {
      error = caught
    }

    test.ok(error instanceof Error)
    test.equal(await db.count(User), 0)
    test.equal(await db.count(posts), 0)
  })

  test('save overrides generated postgres identities for unknown keys', async () => {
    const {'@electric-sql/pglite': connect} = await import('#/driver.ts')
    const {PGlite} = await import('@electric-sql/pglite')
    const db = connect(new PGlite())
    try {
      await db.create(users)
      const generated = await db.save(User, {name: 'Ada'})
      const explicit = await db.save(User, {id: 20, name: 'Lin'})

      test.equal(generated.name, 'Ada')
      test.equal(explicit, {
        id: 20,
        name: 'Lin',
        email: null,
        loginCount: 0
      })
    } finally {
      await db.close()
    }
  })
})
