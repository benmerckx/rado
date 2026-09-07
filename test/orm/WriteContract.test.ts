import assert from 'node:assert/strict'
import {suite} from '@alinea/suite'
import {Column, column} from '#/core/Column.ts'
import {Database} from '#/core/Database.ts'
import {getData, internalData} from '#/core/Internal.ts'
import * as drivers from '#/driver.ts'
import {
  table,
  many,
  one,
  eq,
  sql,
  every,
  OneRelation,
  ManyRelation,
  ModelWrite,
  ModelWriteStart
} from '#/index.ts'
import {mysqlDialect} from '#/mysql/dialect.ts'
import {mysqlDiff} from '#/mysql/diff.ts'
import {id, integer, text, json, boolean} from '#/universal.ts'
import {Callable} from '#/util/Callable.ts'
import {isBun, isDeno} from '../TestRuntime.ts'

const test = suite(import.meta)
for (const dialect of ['sqlite', 'postgres']) {
  if (dialect === 'sqlite' ? !isBun : isDeno) continue
  const original =
    dialect === 'sqlite'
      ? drivers['bun:sqlite'](
          new (await import('bun:sqlite')).Database(':memory:')
        )
      : drivers['@electric-sql/pglite'](
          new (await import('@electric-sql/pglite')).PGlite()
        )
  const queries: string[] = []
  const record = (driver: any): any =>
    new Proxy(driver, {
      get(target, property) {
        if (property === 'prepare')
          return (query: string, options: unknown) => {
            queries.push(query)
            return target.prepare(query, options)
          }
        if (property === 'transaction')
          return (run: Function, options: unknown) =>
            target.transaction((inner: any) => run(record(inner)), options)
        const value = Reflect.get(target, property)
        return typeof value === 'function' ? value.bind(target) : value
      }
    })
  // Deliberately exercise runtime guards independently of the type-only suite.
  const db: any = new Database(
    record(original.driver),
    original.dialect,
    original.diff
  )
  const authors = table('compare_author', {id: id(), name: text().notNull()})
  const roots = table('compare_root', {
    id: id(),
    authorId: integer(),
    title: text().notNull(),
    key: text('root_key').notNull().default('key'),
    active: boolean().notNull().default(true),
    payload: json().$default(() => ({ok: true}))
  })
  const children = table('compare_child', {
    id: id(),
    parentId: integer(),
    body: text().notNull()
  })
  const tags = table('compare_tag', {id: id(), name: text().notNull()})
  const links = table('compare_link', {rootId: integer(), tagId: integer()})
  const Root = {
    ...roots,
    author: one(authors, {from: roots.authorId, to: authors.id}),
    self: one(roots, {from: roots.id, to: roots.id}),
    children: many(children, {from: roots.id, to: children.parentId}),
    tags: many(tags, {
      from: roots.id,
      to: tags.id,
      through: {table: links, from: links.rootId, to: links.tagId}
    })
  }
  let initialized = false
  const check = (name: string, run: () => Promise<void>) =>
    test(`${dialect}: ORM ${name}`, async () => {
      if (!initialized) {
        await db.create(authors, roots, children, tags, links)
        initialized = true
      }
      for (const target of [links, children, roots, authors, tags])
        await db.delete(target)
      queries.length = 0
      await run()
    })
  check(
    'one root update combines mutable predicate and author connection',
    async () => {
      await db.insert(roots).values({title: 'Old'})
      await db.insert(authors).values({name: 'Ada'})
      queries.length = 0
      const result = await db
        .write(Root)
        .where(eq(Root.title, 'Old'))
        .update({title: 'New'})
        .connect(Root.author, eq(Root.author.name, 'Ada'))
        .insert(Root.children, {body: 'Hello'})
        .select({
          title: Root.title,
          author: Root.author({select: {name: Root.author.name}}),
          children: Root.children({select: {body: Root.children.body}})
        })
      assert.deepEqual(result, [
        {title: 'New', author: {name: 'Ada'}, children: [{body: 'Hello'}]}
      ])
      assert.equal(
        queries.filter(query => /^update "compare_root" /i.test(query)).length,
        1
      )
    }
  )
  check(
    'internal returning captures SQL expressions without a preliminary root read',
    async () => {
      const KeyRoot = {
        ...roots,
        items: many(children, {from: roots.key, to: children.body})
      }
      await db.insert(roots).values({title: 'Root', key: 'old'})
      queries.length = 0
      await db
        .write(KeyRoot)
        .where(eq(KeyRoot.key, 'old'))
        .update({key: sql`${KeyRoot.key} || '-new'`})
        .insert(KeyRoot.items, {})
      assert.equal(queries.filter(query => /^select /i.test(query)).length, 0)
      assert.deepEqual(
        await db.find(children, {select: {body: children.body}}),
        [{body: 'old-new'}]
      )
    }
  )
  check(
    'empty scopes cannot change through rows or create dependencies',
    async () => {
      const [row] = await db.insert(roots).values({title: 'Keep'}).returning()
      const [tag] = await db.insert(tags).values({name: 'Keep'}).returning()
      await db.insert(links).values({rootId: row.id, tagId: tag.id})
      await db
        .write(Root)
        .where(eq(Root.title, 'Absent'))
        .insert(Root.author, {name: 'Orphan'})
        .update(Root.tags, eq(Root.tags.name, 'Keep'), {name: 'Wrong'})
        .delete(Root.tags, sql`true`)
        .insert(Root.tags, {name: 'Orphan'})
      assert.equal(await db.count(authors), 0)
      assert.deepEqual(await db.find(tags, {select: {name: tags.name}}), [
        {name: 'Keep'}
      ])
      assert.equal(await db.count(links), 1)
    }
  )
  check(
    'graph selection retains mapped fields and post-write relation state',
    async () => {
      const result = await db
        .write(Root)
        .insert({title: 'Root'})
        .insert(Root.author, {name: 'Ada'})
        .insert(Root.children, {body: 'Old'})
        .update(Root.children, eq(Root.children.body, 'Old'), {body: 'New'})
        .select({
          key: Root.key,
          active: Root.active,
          payload: Root.payload,
          children: Root.children({select: {body: Root.children.body}})
        })
      assert.deepEqual(result, [
        {
          key: 'key',
          active: true,
          payload: {ok: true},
          children: [{body: 'New'}]
        }
      ])
    }
  )
  check(
    'graph root values remain captured when a self-target update changes storage',
    async () => {
      const result = await db
        .write(Root)
        .insert({title: 'Snapshot'})
        .update(Root.self, eq(Root.self.title, 'Snapshot'), {title: 'Stored'})
        .select({title: Root.title})
      assert.deepEqual(result, [{title: 'Snapshot'}])
      assert.deepEqual(await db.find(roots, {select: {title: roots.title}}), [
        {title: 'Stored'}
      ])
    }
  )
  check('native returning precedes dependent self-target updates', async () => {
    const result = await db
      .write(Root)
      .insert({title: 'Snapshot'})
      .update(Root.self, eq(Root.self.title, 'Snapshot'), {title: 'Stored'})
      .returning({title: Root.title})
    assert.deepEqual(result, [{title: 'Snapshot'}])
  })
  check(
    'conditional disconnect preserves unmatched parents and updates later scope',
    async () => {
      const [a, b] = await db
        .insert(authors)
        .values([{name: 'A'}, {name: 'B'}])
        .returning()
      await db.insert(roots).values([
        {title: 'A', authorId: a.id},
        {title: 'B', authorId: b.id}
      ])
      await db
        .write(Root)
        .where(sql`true`)
        .disconnect(Root.author, eq(Root.author.name, 'A'))
        .update(Root.author, sql`true`, {name: 'Changed'})
      assert.deepEqual(
        await db.find(roots, {
          select: {title: roots.title, authorId: roots.authorId},
          orderBy: [roots.title]
        }),
        [
          {title: 'A', authorId: null},
          {title: 'B', authorId: b.id}
        ]
      )
      assert.equal(
        (await db.first(authors, {where: eq(authors.id, a.id)})).name,
        'A'
      )
      assert.equal(
        (await db.first(authors, {where: eq(authors.id, b.id)})).name,
        'Changed'
      )
    }
  )
  check('branching plans remain immutable', async () => {
    const start = db.write(Root)
    const base = start.insert({title: 'Root'})
    const left = base.insert(Root.children, {body: 'Left'})
    const right = base.insert(Root.children, {body: 'Right'})
    assert.equal(getData<any>(left).prev, getData(base))
    assert.equal(getData<any>(right).prev, getData(base))
    assert.equal(getData<any>(base).prev, undefined)
    assert.deepEqual(Object.getOwnPropertyNames(start), [])
    assert.deepEqual(Object.getOwnPropertyNames(left), [])
    assert.deepEqual(Object.getOwnPropertySymbols(left), [internalData])
    await left
    await right
    assert.deepEqual(
      await db.find(children, {
        select: {body: children.body},
        orderBy: [children.body]
      }),
      [{body: 'Left'}, {body: 'Right'}]
    )
  })
  check(
    'linked segments retain call order and local validation boundaries',
    async () => {
      const base = db
        .write(Root)
        .insert({title: 'Root'})
        .insert(Root.author, {name: 'First'})
        .insert(Root.children, {body: 'First'})
      const start = base.write(Root)
      const scope = start.where(eq(Root.title, 'Root'))
      assert.equal(getData<any>(start).prev, getData(base))
      assert.equal(getData<any>(scope).prev, getData(base))
      const result = await scope
        .update({title: 'Updated'})
        .insert(Root.author, {name: 'Second'})
        .insert(Root.children, {body: 'Second'})
        .select({
          title: Root.title,
          author: Root.author({select: {name: Root.author.name}}),
          children: Root.children({
            select: {body: Root.children.body},
            orderBy: [Root.children.body]
          })
        })
      assert.deepEqual(result, [
        {
          title: 'Updated',
          author: {name: 'Second'},
          children: [{body: 'First'}, {body: 'Second'}]
        }
      ])
      assert.equal(getData<any>(base).prev.instruction.action.ownsRoot, true)
      assert.throws(() =>
        base
          .write(Root)
          .where(sql`true`)
          .returning()
      )
    }
  )
  check(
    'long linked plans execute iteratively without changing their prefixes',
    async () => {
      const base = db.write(Root).insert([])
      let tail = base
      for (let index = 0; index < 12000; index++)
        tail = tail.insert(Root.children, {body: 'Unused'})
      const result = await tail.returning({title: Root.title})
      assert.deepEqual(result, [])
      assert.equal(getData<any>(base).prev, undefined)
      assert.equal(queries.length, 0)
    }
  )
  check('failing final selection rolls back all writes', async () => {
    await assert.rejects(async () => {
      await db
        .write(Root)
        .insert({title: 'Root'})
        .insert(Root.children, {body: 'Child'})
        .select({bad: sql`nonexistent_table.nonexistent_column`})
    })
    assert.equal(await db.count(roots), 0)
    assert.equal(await db.count(children), 0)
  })
  check('root-only mutations avoid preliminary selects', async () => {
    await db.insert(roots).values({title: 'Old'})
    queries.length = 0
    await db.write(Root).where(eq(Root.title, 'Old')).update({title: 'New'})
    assert.equal(queries.filter(query => /^select /i.test(query)).length, 0)
    assert.ok(queries.every(query => !/returning/i.test(query)))
  })
  check('leaf inserts do not request unused returning rows', async () => {
    await db
      .write(Root)
      .insert({title: 'Root'})
      .insert(Root.children, {body: 'Child'})
    const inserts = queries.filter(query => /^insert /i.test(query))
    assert.equal(inserts.length, 2)
    assert.match(inserts[0]!, /returning/i)
    assert.doesNotMatch(inserts[1]!, /returning/i)
  })
  check('scalar returning works without internal root capture', async () => {
    const result = await db
      .write(Root)
      .insert({title: 'Root'})
      .returning(Root.title)
    assert.deepEqual(result, ['Root'])
  })
  check(
    'returning keeps user root and result fields separate from capture',
    async () => {
      const result = await db
        .write(Root)
        .insert({title: 'Root'})
        .insert(Root.children, {body: 'Child'})
        .returning({root: Root.title, result: Root.payload})
      assert.deepEqual(result, [{root: 'Root', result: {ok: true}}])
      assert.equal(await db.count(children), 1)
    }
  )
  check(
    'owned assignments and output do not leak across repeated executions',
    async () => {
      const plan = db
        .write(Root)
        .insert({title: 'Root'})
        .insert(Root.author, {name: 'Author'})
      assert.deepEqual(await plan.returning(Root.title), ['Root'])
      assert.deepEqual(await plan.select(Root.title), ['Root'])
      queries.length = 0
      await plan
      const mutations = queries.filter(query =>
        /^insert into "compare_root" /i.test(query)
      )
      assert.equal(mutations.length, 1)
      assert.doesNotMatch(mutations[0]!, /returning/i)
      assert.equal(await db.count(authors), 3)
      assert.equal(await db.count(roots), 3)
    }
  )
  check(
    'relation definitions reject empty and mismatched field mappings',
    async () => {
      const invalid = /equal, nonzero lengths/
      assert.throws(() => one(authors, {from: [], to: []}), invalid)
      assert.throws(() => many(children, {from: roots.id, to: []}), invalid)
      assert.throws(
        () =>
          many(children, {
            from: [roots.id, roots.authorId],
            to: children.parentId
          }),
        invalid
      )
      assert.throws(
        () =>
          many(tags, {
            from: roots.id,
            to: tags.id,
            through: {table: links, from: [], to: links.tagId}
          }),
        invalid
      )
      assert.throws(
        () =>
          many(tags, {
            from: roots.id,
            to: tags.id,
            through: {table: links, from: links.rootId, to: []}
          }),
        invalid
      )
      assert.equal(queries.length, 0)
    }
  )
  check('through inserts share targets across multiple roots', async () => {
    await db
      .write(Root)
      .insert([{title: 'First'}, {title: 'Second'}])
      .insert(Root.tags, {name: 'Shared'})
    assert.equal(await db.count(tags), 1)
    assert.equal(await db.count(links), 2)
    assert.equal(queries.filter(query => /^insert /i.test(query)).length, 3)
    const rows = await db.find(Root, {
      select: {tags: Root.tags({select: {name: Root.tags.name}})}
    })
    assert.deepEqual(rows, [
      {tags: [{name: 'Shared'}]},
      {tags: [{name: 'Shared'}]}
    ])
  })
  check(
    'phase and duplicate assignments fail before database writes',
    async () => {
      const base = db.write(Root).where(sql`true`)
      assert.throws(() => base.delete().delete())
      assert.throws(() =>
        base
          .insert(Root.children, {body: 'Child'})
          .connect(Root.author, sql`true`)
      )
      assert.throws(() =>
        base.connect(Root.author, sql`true`).insert(Root.author, {name: 'Ada'})
      )
      assert.throws(() =>
        base.update({authorId: 1}).connect(Root.author, sql`true`)
      )
      assert.equal(queries.length, 0)
    }
  )
  check('empty inserted arrays never create related rows', async () => {
    const result = await db
      .write(Root)
      .insert([])
      .insert(Root.author, {name: 'Orphan'})
      .insert(Root.children, {body: 'Orphan'})
      .select({id: Root.id})
    assert.deepEqual(result, [])
    assert.equal(await db.count(authors), 0)
    assert.equal(await db.count(children), 0)
  })
  check(
    'every with an omitted condition accepts populated and empty relations',
    async () => {
      const [row] = await db
        .insert(roots)
        .values([{title: 'Populated'}, {title: 'Empty'}])
        .returning()
      await db.insert(children).values({parentId: row.id, body: 'Child'})
      assert.equal(await db.count(Root, {where: every(Root.children)}), 2)
    }
  )
  check(
    'exported runtime constructors match objects returned by the API',
    async () => {
      assert.ok(Root.author instanceof OneRelation)
      assert.ok(Root.children instanceof ManyRelation)
      assert.ok(Root.author instanceof Callable)
      assert.ok(Root.children instanceof Callable)
      assert.ok(db.write(Root) instanceof ModelWriteStart)
      assert.ok(db.write(Root).insert({title: 'Root'}) instanceof ModelWrite)
    }
  )
  check(
    'callable and internal method names remain usable as relation fields',
    async () => {
      const target = table('orm_callable_fields', {
        owner: integer(),
        name: text(),
        length: integer(),
        call: text(),
        apply: text(),
        include: text(),
        query: text(),
        constructor: text()
      })
      const Parent = {
        ...roots,
        fields: many(target, {from: roots.id, to: target.owner})
      }
      const row = {
        name: 'Name',
        length: 2,
        call: 'Call',
        apply: 'Apply',
        include: 'Include',
        query: 'Query',
        constructor: 'Constructor'
      }
      await db.create(target)
      try {
        const result = await db
          .write(Parent)
          .insert({title: 'Parent'})
          .insert(Parent.fields, row)
          .select({
            fields: Parent.fields({
              select: {
                name: Parent.fields.name,
                length: Parent.fields.length,
                call: Parent.fields.call,
                apply: Parent.fields.apply,
                include: Parent.fields.include,
                query: Parent.fields.query,
                constructor: Parent.fields.constructor
              },
              where: eq(Parent.fields.call, 'Call')
            })
          })
        assert.deepEqual(result, [{fields: [row]}])
      } finally {
        await db.drop(target)
      }
    }
  )
  check(
    'one target deletion uses database equality for decoded relation values',
    async () => {
      const date = new Column({
        type: column.integer(),
        mapFromDriverValue: (value: unknown) =>
          value === null ? null : new Date(Number(value)),
        mapToDriverValue: (value: Date) => value.getTime()
      })
      const target = table('compare_date_target', {at: date})
      const parent = table('compare_date_parent', {linkedAt: date})
      const Parent = {
        ...parent,
        target: one(target, {from: parent.linkedAt, to: target.at})
      }
      await db.create(target, parent)
      try {
        await db.insert(target).values({at: new Date(1000)})
        await db.insert(parent).values({linkedAt: new Date(1000)})
        await db
          .write(Parent)
          .where(sql`true`)
          .delete(Parent.target, sql`true`)
        assert.equal(await db.count(target), 0)
        assert.deepEqual(await db.find(parent), [{linkedAt: null}])
      } finally {
        await db.drop(parent, target)
      }
    }
  )
  test(`${dialect}: close ORM contract database`, async () => {
    await db.close()
  })
}
// These exercise planning only; they are not a substitute for a live MySQL run.
const mysqlCheck = (
  name: string,
  run: (
    db: any,
    calls: Array<{sql: string; params: unknown[]}>,
    reads: unknown[][][]
  ) => Promise<void>
) =>
  test(`mysql planner: ORM ${name}`, async () => {
    const calls: Array<{sql: string; params: unknown[]}> = []
    const reads: unknown[][][] = []
    const driver = {
      parsesJson: true,
      supportsTransactions: true,
      close() {},
      exec() {},
      batch() {
        return []
      },
      transaction(run: Function) {
        return run(driver)
      },
      prepare(query: string) {
        const record = (params: unknown[]) => calls.push({sql: query, params})
        return {
          run(params: unknown[]) {
            record(params)
            return {affectedRows: 1, changedRows: 1, insertId: 999}
          },
          values(params: unknown[]) {
            record(params)
            return reads.shift() ?? []
          },
          all() {
            throw new Error('Unexpected unmapped query')
          },
          get() {
            throw new Error('Unexpected unmapped query')
          },
          free() {}
        }
      }
    }
    await run(new Database(driver, mysqlDialect, mysqlDiff), calls, reads)
  })
mysqlCheck(
  'root-only mutations do not read or return rows',
  async (db, calls) => {
    const parent = table('mock_parent', {key: text()})
    await db.write(parent).where(eq(parent.key, 'old')).update({key: 'new'})
    await db.write(parent).where(eq(parent.key, 'new')).delete()
    assert.equal(calls.length, 2)
    assert.match(calls[0]!.sql, /^update /i)
    assert.match(calls[1]!.sql, /^delete /i)
    assert.ok(calls.every(call => !/returning/i.test(call.sql)))
  }
)
mysqlCheck(
  'SQL-computed relation updates are rejected before SQL',
  async (db, calls) => {
    const parent = table('mock_parent', {key: text()})
    const child = table('mock_child', {owner: text()})
    const Parent = {
      ...parent,
      children: many(child, {from: parent.key, to: child.owner})
    }
    await assert.rejects(async () => {
      await db
        .write(Parent)
        .where(sql`true`)
        .update({key: sql`uuid()`})
        .insert(Parent.children, {})
    })
    assert.equal(calls.length, 0)
  }
)
mysqlCheck(
  'client-generated relation values are materialized once',
  async (db, calls) => {
    let generated = 0
    const parents = table('mock_parent', {
      key: text().$default(() => `key-${++generated}`)
    })
    const children = table('mock_child', {owner: text()})
    const Parent = {
      ...parents,
      children: many(children, {from: parents.key, to: children.owner})
    }
    await db.write(Parent).insert({}).insert(Parent.children, {})
    assert.equal(generated, 1)
    const inserts = calls.filter(call => /^insert /i.test(call.sql))
    assert.equal(inserts.length, 2)
    assert.deepEqual(
      inserts.map(call => call.params),
      [['key-1'], ['key-1']]
    )
  }
)
mysqlCheck(
  'unknown identity is rejected without using insertId',
  async (db, calls) => {
    const parents = table('mock_parent', {key: id()})
    const children = table('mock_child', {owner: integer()})
    const Parent = {
      ...parents,
      children: many(children, {from: parents.key, to: children.owner})
    }
    await assert.rejects(async () => {
      await db.write(Parent).insert({}).insert(Parent.children, {})
    })
    assert.equal(calls.length, 0)
  }
)
mysqlCheck(
  'SQL-computed inserted relation values are rejected',
  async (db, calls) => {
    const parents = table('mock_parent', {key: text()})
    const children = table('mock_child', {owner: text()})
    const Parent = {
      ...parents,
      children: many(children, {from: parents.key, to: children.owner})
    }
    await assert.rejects(async () => {
      await db
        .write(Parent)
        .insert({key: sql`uuid()`})
        .insert(Parent.children, {})
    })
    assert.equal(calls.length, 0)
  }
)
mysqlCheck(
  'literal key updates feed dependents from a locked projection',
  async (db, calls, reads) => {
    const parents = table('mock_parent', {key: text()})
    const children = table('mock_child', {owner: text()})
    const Parent = {
      ...parents,
      children: many(children, {from: parents.key, to: children.owner})
    }
    reads.push([['new']])
    await db
      .write(Parent)
      .where(eq(Parent.key, 'old'))
      .update({key: 'new'})
      .insert(Parent.children, {})
    assert.ok(calls.some(call => /for update/i.test(call.sql)))
    assert.deepEqual(calls.find(call => /^insert /i.test(call.sql))?.params, [
      'new'
    ])
  }
)
