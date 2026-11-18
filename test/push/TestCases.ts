import type {DefineTest} from '@alinea/suite'
import {exec, type Gen, signature, type TableInfo} from '#/core/Push.ts'
import type {Push, PushOptions} from '#/core/Push.ts'
import {type Database, type Table, getTable, sql} from '#/index.ts'

export interface Case {
  // Raw SQL creating the current schema, including rows
  current?: string
  desired: Array<Table>
  options?: PushOptions
  // Columns per table whose data must survive the push
  keep?: Record<string, Array<string>>
  skip?: string
}

export interface Dialect {
  push: Push
  inspect(db: Database, table: Table): Gen<TableInfo | undefined>
  drop(name: string): string
}

const byKey = (a: [string, unknown], b: [string, unknown]) =>
  a[0] < b[0] ? -1 : 1

function normalize(info: TableInfo | undefined) {
  if (!info) return undefined
  return {
    columns: Object.entries(info.columns).toSorted(byKey),
    constraints: Object.values(info.constraints).toSorted(),
    indexes: Object.entries(info.indexes).toSorted(byKey),
    foreignKeys: info.foreignKeys.map(signature).toSorted()
  }
}

function statements(text = ''): Array<string> {
  return text
    .split(/;(?:\s+|$)/)
    .map(statement => statement.trim().replace(/;$/, ''))
    .filter(Boolean)
}

function created(text = ''): Array<string> {
  return [...text.matchAll(/create table (?:if not exists )?([^\s(]+)/gi)].map(
    match => match[1].replace(/["`[\]]/g, '')
  )
}

function identifier(name: string) {
  return sql.join(name.split('.').map(sql.identifier), sql`.`)
}

export function testCases(
  db: Database,
  test: DefineTest<any>,
  dialect: Dialect,
  cases: Record<string, Case>
) {
  const tableName = (table: Table) => {
    const api = getTable(table)
    return api.schemaName ? `${api.schemaName}.${api.name}` : api.name
  }
  const read = async (tables: Array<Table>) => {
    const result = []
    for (const table of tables)
      result.push(normalize(await exec(dialect.inspect(db, table))))
    return result
  }
  // A column written as "from:to" is read as "from" before the push
  const rows = async (keep: Case['keep'] = {}, after = false) => {
    const result: Record<string, unknown> = {}
    for (const [name, columns] of Object.entries(keep)) {
      const names = columns.map(column => {
        const [from, to = from] = column.split(':')
        return sql`${sql.identifier(after ? to : from)} as ${sql.identifier(to)}`
      })
      result[name] = await db.all(
        sql`select ${sql.join(names, sql`, `)} from ${identifier(
          name
        )} order by 1`
      )
    }
    return result
  }
  for (const [name, c] of Object.entries(cases)) {
    const define = c.skip ? test.skip : test
    define(name, async () => {
      const names = [
        ...new Set([...c.desired.map(tableName), ...created(c.current)])
      ].toReversed()
      const clean = async () => {
        for (const name of names) await db.run(sql.unsafe(dialect.drop(name)))
      }
      await clean()
      try {
        for (const statement of statements(c.current))
          await db.run(sql.unsafe(statement))
        const before = await rows(c.keep)
        const options = c.options ?? {}
        await dialect.push(db, ...c.desired, options)
        const pushed = await read(c.desired)
        test.equal(await dialect.push.plan(db, ...c.desired, options), [])
        test.equal(await rows(c.keep, true), before)
        for (const name of names) await db.run(sql.unsafe(dialect.drop(name)))
        await db.create(...c.desired)
        test.equal(pushed, await read(c.desired))
      } finally {
        await clean()
      }
    })
  }
}
