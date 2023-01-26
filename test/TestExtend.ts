import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {column, create, table} from '../src/index'
import {connect} from './DbSuite'

const UserTable = table({
  name: 'user',
  columns: {
    id: column.integer().primaryKey<'user'>(),
    firstName: column.string(),
    lastName: column.string()
  }
})
type User = table.infer<typeof UserTable>
const User = table.extend(UserTable, {
  name() {
    return this.firstName.concat(' ').concat(this.lastName)
  },
  roles() {
    return Role.innerJoin(UserRoles, Role.id.is(UserRoles.roleId)).innerJoin(
      this,
      UserRoles.userId.is(this.id)
    )
  }
})

const Role = table({
  name: 'role',
  columns: {
    id: column.integer().primaryKey<'role'>(),
    name: column.string()
  }
})
type Role = table.infer<typeof Role>

const UserRoles = table({
  name: 'user_roles',
  columns: {
    userId: column.integer().references(UserTable.id),
    roleId: column.integer().references(Role.id)
  }
})

test('Extend', async () => {
  const query = await connect()
  await query(create(Role, User, UserRoles))
  const user1 = await query(
    User.insertOne({
      firstName: 'a',
      lastName: 'b'
    })
  )
  const role1 = await query(Role.insertOne({name: 'role1'}))
  const role2 = await query(Role.insertOne({name: 'role2'}))
  await query(
    UserRoles.insertAll([
      {userId: user1.id, roleId: role1.id},
      {userId: user1.id, roleId: role2.id}
    ])
  )
  const {Aliased} = User.alias()
  const user = await query(
    Aliased.first().select({
      name: Aliased.name(),
      roles: Aliased.roles()
    })
  )
  assert.equal(user, {
    name: 'a b',
    roles: [role1, role2]
  })
})

test.run()
