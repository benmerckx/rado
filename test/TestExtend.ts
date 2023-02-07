import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, create, table} from '../src/index'
import {connect} from './DbSuite'

type User = table<typeof User>
const User = table('user')(
  class User {
    id = column.integer().primaryKey<'user'>()
    firstName = column.string()
    lastName = column.string()

    name() {
      return this.firstName.concat(' ').concat(this.lastName)
    }

    roles() {
      return Role({id: UserRoles.roleId}).innerJoin(
        UserRoles({userId: this.id})
      )
    }
  }
)

type Role = table<typeof Role>
const Role = table('role')(
  class Role {
    id = column.integer().primaryKey<Role>()
    name = column.string()

    users() {
      return User({id: UserRoles.userId}).innerJoin(
        UserRoles({roleId: this.id})
      )
    }
  }
)

const UserRoles = table('user_roles')(
  class UserRoles {
    userId = column.integer().references(() => User.id)
    roleId = column.integer().references(() => Role.id)
  }
)

test('Extend', async () => {
  const db = await connect()
  await create(Role, User, UserRoles).on(db)
  const user1 = await User()
    .insertOne({
      firstName: 'a',
      lastName: 'b'
    })
    .on(db)

  const role1 = await Role().insertOne({name: 'role1'}).on(db)
  const role2 = await Role().insertOne({name: 'role2'}).on(db)
  const role3 = await Role().insertOne({name: 'role3'}).on(db)
  await UserRoles()
    .insertAll([
      {userId: user1.id, roleId: role1.id},
      {userId: user1.id, roleId: role2.id}
    ])
    .on(db)
  const Aliased = User().as('Aliased')
  const query = Aliased().first().select({
    name: Aliased.name(),
    roles: Aliased.roles()
  })
  const user = await query.on(db)
  assert.equal(user, {
    name: 'a b',
    roles: [role1, role2]
  })
})

test.run()
