import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {TableMeta, column, create, index, table} from '../src/index'
import {connect} from './DbSuite'

const User = table({
  user: class {
    id = column.integer().primaryKey()
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
})

const Role = table({
  role: class {
    id = column.integer().primaryKey<'role'>()
    name = column.string()

    users() {
      return User({id: UserRoles.userId}).innerJoin(
        UserRoles({roleId: this.id})
      )
    }
  }
})

const UserRoles = table({
  user_roles: class {
    userId = column.integer().references(() => User.id)
    roleId = column.integer().references(() => Role.id)

    protected [table.meta](): TableMeta {
      return {
        indexes: {
          userId: index(this.userId),
          roleId: index(this.roleId)
        }
      }
    }
  }
})

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
  const query = Aliased().maybeFirst().select({
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
