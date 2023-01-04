import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, create} from '../src'
import {collection} from '../src/Collection'
import {connect} from './DbSuite'

test('IncludeMany', () => {
  const query = connect()
  const Role = collection({
    name: 'Role',
    columns: {
      id: column.integer().primaryKey(),
      name: column.string()
    }
  })
  const User = collection({
    name: 'User',
    columns: {
      id: column.integer().primaryKey(),
      roles: column.array<number>()
    }
  })
  const Entry = collection({
    name: 'Entry',
    columns: {
      id: column.integer().primaryKey()
    }
  })
  const Language = collection({
    name: 'Language',
    columns: {
      id: column.integer().primaryKey(),
      entry: column.integer()
    }
  })
  const Version = collection({
    name: 'Version',
    columns: {
      id: column.integer().primaryKey(),
      language: column.integer()
    }
  })
  query(create(Role, User, Entry, Language, Version))
  const role1 = query(Role.insertOne({name: 'role1'}))
  const role2 = query(Role.insertOne({name: 'role2'}))
  const user = query(User.insertOne({roles: [role1.id, role2.id]}))
  const UserAlias = User.as('user1')
  const RoleAlias = Role.as('role')
  const bundled = query(
    UserAlias.first().select({
      ...UserAlias,
      roles: RoleAlias.select({
        name: RoleAlias.name
      })
        .orderBy(RoleAlias.name.asc())
        .where(RoleAlias.id.isIn(UserAlias.roles))
    })
  )!
  assert.equal(bundled.roles, [{name: 'role1'}, {name: 'role2'}])
  const entry = query(Entry.insertOne({}))
  const language = query(Language.insertOne({entry: entry.id}))
  const version1 = query(
    Version.insertOne({
      language: language.id
    })
  )
  const version2 = query(
    Version.insertOne({
      language: language.id
    })
  )
  const languages = Language.where(Language.entry.is(Entry.id)).select({
    ...Language,
    versions: Version.where(Version.language.is(Language.id))
  })
  const page = query(Entry.select({...Entry, languages}).first())
  assert.equal(page, {
    ...entry,
    languages: [{...language, versions: [version1, version2]}]
  })
})

/*
test('Subquery', () => {
  const db = store()
  const User = collection<{id: string; name: string}>('user')
  const Post = collection<{id: string; title: string; user: string}>('post')
  const user1 = db.insert(User, {name: 'bob'})
  const post1 = db.insert(Post, {title: 'hello', user: user1.id})
  const userWithPosts = db.first(
    User.where(User.id.is(user1.id)).select(
      User.with({
        posts: Post.where(Post.user.is(User.id)).select({
          id: Post.id
        })
      })
    )
  )!
  assert.is(userWithPosts.name, 'bob')
  assert.is(userWithPosts.posts[0].id, post1.id)
})*/

test.run()
