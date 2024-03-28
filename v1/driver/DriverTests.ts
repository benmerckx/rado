import {expect} from 'bun:test'
import type {Database} from '../core/Database.ts'
import {table} from '../core/Table.ts'
import {type SyncQuery, eq} from '../index.ts'
import {integer, text} from '../sqlite.ts'

const Node = table('Node', {
  id: integer().primaryKey(),
  textField: text().notNull()
})

export function testCreate(db: Database<SyncQuery>) {
  return async () => {
    await db.create(Node)
    await db.insert(Node).values({
      textField: 'hello'
    })
    const nodes = await db.select().from(Node)
    expect(nodes).toEqual([{id: 1, textField: 'hello'}])
    await db.update(Node).set({textField: 'world'}).where(eq(Node.id, 1))
    const [node] = await db.select(Node.textField).from(Node)
    expect(node).toEqual('world')
  }
}
