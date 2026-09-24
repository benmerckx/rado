import {suite} from '@alinea/suite'
import {
  alias,
  and,
  desc,
  eq,
  gt,
  include,
  inArray,
  isNull,
  sql,
  table
} from '#/index.ts'
import {sqliteDialect} from '#/sqlite/dialect.ts'
import {id, integer, json, text} from '#/universal.ts'
import {builder} from '../TestUtils.ts'

const Entry = table('Entry', {
  id: id(),
  parent: integer(),
  title: text(),
  data: json<{path: string; rank: number}>()
})

interface Shape {
  ids: Array<number>
  parent: number | null
  limit?: number
  offset?: number
  depth: number
}

function children(parent: typeof Entry, depth: number, name: string): any {
  const E = alias(Entry, name)
  const sel: Record<string, any> = {id: E.id, path: E.data.path}
  if (depth > 0) sel.children = children(E as any, depth - 1, `${name}_c`)
  return include(builder.select(sel).from(E).where(eq(E.parent, parent.id)))
}

function query(shape: Shape) {
  let select = builder
    .select({
      id: Entry.id,
      title: Entry.title,
      first: include.one(
        builder
          .select({title: Entry.title})
          .from(Entry)
          .where(eq(Entry.data.path, sql.placeholder('path')))
      ),
      children: children(Entry, shape.depth, 'c')
    })
    .from(Entry)
    .where(
      and(
        inArray(Entry.id, shape.ids),
        shape.parent === null
          ? isNull(Entry.parent)
          : eq(Entry.parent, shape.parent),
        gt(Entry.data.rank, sql.inline(shape.depth))
      )
    )
    .orderBy(desc(Entry.data.rank), Entry.title)
  if (shape.limit !== undefined) select = select.limit(shape.limit)
  if (shape.offset !== undefined) select = select.offset(shape.offset)
  return select
}

function emit(input: Parameters<typeof sqliteDialect.emit>[0]) {
  const emitter = sqliteDialect.emit(input)
  return {sql: emitter.sql, params: emitter.bind({path: 'p'})}
}

const shapes: Array<Shape> = []
for (const ids of [[1], [1, 2], [3, 2, 1]])
  for (const parent of [null, 0, 7])
    for (const [limit, offset] of [[], [5], [5, 10], [undefined, 3]])
      for (const depth of [0, 2])
        shapes.push({ids, parent, limit, offset, depth})

suite(import.meta, test => {
  test('emitting a builder again matches a fresh emit', () => {
    for (const shape of shapes) {
      const fresh = emit(query(shape))
      const built = query(shape)
      test.equal(emit(built), fresh)
      test.equal(emit(built), fresh)
    }
  })

  test('cached shapes do not leak values into other shapes', () => {
    const built = shapes.map(query)
    const first = built.map(emit)
    const second = built.map(emit)
    for (let i = 0; i < shapes.length; i++) {
      test.equal(first[i], emit(query(shapes[i]!)))
      test.equal(second[i], first[i])
      const {ids, parent, limit, offset} = shapes[i]!
      const expected = [
        'p',
        ...ids,
        ...(parent === null ? [] : [parent]),
        ...(limit === undefined ? [] : [limit]),
        ...(offset === undefined ? [] : [offset])
      ]
      test.equal(first[i]!.params, expected)
    }
  })

  test('sub builders shared between queries emit the same sql', () => {
    const shared = children(Entry, 2, 'c')
    const inOne = builder.select({id: Entry.id, shared}).from(Entry)
    const inOther = builder
      .select({title: Entry.title, shared})
      .from(Entry)
      .where(eq(Entry.id, 1))
    const fresh = (select: Record<string, any>) =>
      emit(builder.select(select).from(Entry))
    test.equal(
      emit(inOne),
      fresh({id: Entry.id, shared: children(Entry, 2, 'c')})
    )
    test.equal(
      emit(inOther),
      emit(
        builder
          .select({title: Entry.title, shared: children(Entry, 2, 'c')})
          .from(Entry)
          .where(eq(Entry.id, 1))
      )
    )
    test.equal(emit(inOne), fresh({id: Entry.id, shared}))
  })
})
