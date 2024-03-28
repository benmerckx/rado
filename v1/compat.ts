import {QueryBuilder, pgTable, serial, varchar} from 'drizzle-orm/pg-core'

const builder = new QueryBuilder()

const Node = pgTable('Node', {
  id: serial('id'),
  field1: varchar('field1')
})

const res = builder
  .select({
    sub: {
      id: Node.id,
      field1: Node.field1
    },
    bub: Node
  })
  .from(Node)
  .toSQL()

console.log(res)
