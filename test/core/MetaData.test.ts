import {suite} from '@alinea/suite'
import type {HasSql} from '#/core/Internal.ts'
import type {Async, Deliver, Either, Sync} from '#/core/MetaData.ts'
import {alias, eq, table} from '#/index.ts'
import {integer, text} from '#/universal.ts'
import {builder} from '../TestUtils.ts'

type Equal<A, B extends A & (A extends B ? unknown : never)> = true
const Expect = <T extends true>() => {}

suite(import.meta, test => {
  test('deliver resolves sync mode to sync result', () => {
    type SyncResult = Deliver<Sync<'sqlite'>, {id: number}>
    type AsyncResult = Deliver<Async<'sqlite'>, {id: number}>
    type EitherResult = Deliver<Either, {id: number}>

    Expect<Equal<SyncResult, {id: number}>>()
    Expect<Equal<AsyncResult, Promise<{id: number}>>>()
    Expect<Equal<EitherResult, {id: number} | Promise<{id: number}>>>()
  })

  test('explicit joined select keeps explicit row type', () => {
    const Node = table('Node', {
      id: integer().primaryKey(),
      field1: text().notNull()
    })
    const right = alias(Node, 'right')
    const joined = builder
      .select(Node)
      .from(Node)
      .leftJoin(right, eq(right.id, 1))

    type Row = typeof joined extends HasSql<infer Result> ? Result : never
    Expect<Equal<Row, {id: number; field1: string}>>()
  })
})
