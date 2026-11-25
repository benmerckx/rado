import type {DefineTest} from '@alinea/suite'
import * as hegel from '@hegeldev/hegel'
import * as gs from '@hegeldev/hegel/generators'
import type {Generate} from '#/core/Generate.ts'
import type {SchemaInfo, TableInfo} from '#/core/Inspect.ts'
import type {Push} from '#/core/Push.ts'
import {
  type Column,
  type Database,
  type Table,
  foreignKey,
  index,
  primaryKey,
  sql,
  table,
  unique,
  uniqueIndex
} from '#/index.ts'
import {migrate} from '#/migrate.ts'
import {isBun} from '../../TestRuntime.ts'

type Gen<T> = gs.PrintableGenerator<T>

export {gs}

const {FUZZ_RUNS, CI} = process.env
// Each run pushes several times, CI runs every file on bun and node
export const runs = Number(FUZZ_RUNS) || (CI ? 10 : 25)

// See Fuzz.ts, bun's timeout is set per test file, and a run of these
// takes longer than its default
const bun = isBun ? await import('bun:test') : undefined

export interface Type {
  name: string
  column(): Column<unknown>
  // A few values, so foreign keys and unique keys find matches
  values: Gen<unknown>
  // A default to set, if the column type takes one
  fallback?: unknown
  // Can be part of a key or index
  key?: boolean
  // Types push changes this one to without checking rows
  widens?: Array<string>
}

export interface Target {
  label: string
  db: Database
  push: Push<any>
  generate: Generate<any>
  types: Array<Type>
  // Statements that drop every table, type and schema a run creates
  clean(tables: Array<string>): Array<string>
  read(db: Database): Promise<SchemaInfo>
  shadow?: Database
  // The schema the last table is in, on postgres
  schema?: string
  // Push applies everything or nothing
  atomic?: boolean
  // The type whose single column primary key is the rowid, on sqlite
  rowid?: string
}

export interface ColumnSpec {
  type: number
  notNull: boolean
  fallback: boolean
  unique: boolean
}

export interface IndexSpec {
  columns: Array<number>
  unique: boolean
  constraint: boolean
}

export interface KeySpec {
  columns: Array<number>
  table: number
  inline: boolean
  action: number
}

export interface TableSpec {
  columns: Array<ColumnSpec | null>
  primary: Array<number>
  inline: boolean
  indexes: Array<IndexSpec>
  keys: Array<KeySpec>
}

export type SchemaSpec = Array<TableSpec | null>

const width = 4
const size = 3
const actions = ['no action', 'cascade', 'restrict', 'set null'] as const

function slots(maxSize: number): Gen<Array<number>> {
  return gs.arrays(gs.integers({minValue: 0, maxValue: width - 1}), {
    minSize: 1,
    maxSize,
    unique: true
  })
}

export function schemas(types: number): Gen<SchemaSpec> {
  const column = gs.record({
    type: gs.integers({minValue: 0, maxValue: types - 1}),
    notNull: gs.booleans(),
    fallback: gs.booleans(),
    unique: gs.weightedBooleans(0.15)
  })
  const spec = gs.record({
    columns: gs.arrays(gs.optional(column), {minSize: width, maxSize: width}),
    primary: gs.oneOf(gs.just([]), slots(2)),
    inline: gs.booleans(),
    indexes: gs.arrays(
      gs.record({
        columns: slots(2),
        unique: gs.booleans(),
        constraint: gs.booleans()
      }),
      {maxSize: 2}
    ),
    keys: gs.arrays(
      gs.record({
        columns: slots(2),
        table: gs.integers({minValue: 0, maxValue: size - 1}),
        inline: gs.booleans(),
        action: gs.integers({minValue: 0, maxValue: actions.length - 1})
      }),
      {maxSize: 2}
    )
  })
  return gs.arrays(gs.optional(spec), {minSize: size, maxSize: size})
}

// Two schemas, the second often a variation of the first: each table, and
// each column of it, kept or taken from an independent draw, so a single
// change, such as a dropped column, shows up often
export function pairs(types: number): Gen<[SchemaSpec, SchemaSpec]> {
  const spec = schemas(types)
  const step = width + 1
  const picks = gs.arrays(gs.booleans(), {
    minSize: size * step,
    maxSize: size * step
  })
  return gs.composite(tc => {
    const a = tc.draw(spec)
    const other = tc.draw(spec)
    if (tc.draw(gs.booleans())) return [a, other]
    const pick = tc.draw(picks)
    const b = a.map((t, i) => {
      const o = other[i]
      if (!t || !o || pick[i * step]) return o
      const columns = t.columns.map((c, slot) =>
        pick[i * step + slot + 1] ? o.columns[slot] : c
      )
      return {...t, columns}
    })
    return [a, b]
  })
}

export interface Built {
  tables: Record<string, Table>
  // Column types and specs by table and column name
  types: Record<string, Record<string, Type>>
  columns: Record<string, Record<string, ColumnSpec>>
  // The tables each table references
  references: Record<string, Array<string>>
  primary: Record<string, Array<string> | undefined>
}

export const prefix: string = `fz${Math.random().toString(36).slice(2, 7)}`
export const names: Array<string> = Array.from(
  {length: size},
  (_, i) => `${prefix}_t${i}`
)

interface Link {
  from: Array<string>
  to: Array<string>
  table: number
  inline: boolean
  action: number
}

// Leaves out what can't be built: a key over a missing column or one that
// can't be keyed, a foreign key to a table without a primary key
export function build(target: Target, spec: SchemaSpec): Built {
  const result: Built = {
    tables: {},
    types: {},
    columns: {},
    references: {},
    primary: {}
  }
  const primaries: Array<Array<string> | undefined> = []
  for (const [i, t] of spec.entries()) {
    const present = (t?.columns ?? []).flatMap((c, slot) =>
      c ? [[`c${slot}`, c] as const] : []
    )
    if (!t || present.length === 0) continue
    const name = names[i]
    const own: Record<string, ColumnSpec> = Object.fromEntries(present)
    const kind: Record<string, Type> = Object.fromEntries(
      present.map(([key, c]) => [key, target.types[c.type]])
    )
    const keyed = (slots: Array<number>) => {
      const keys = slots.map(slot => `c${slot}`)
      return keys.every(key => own[key] && kind[key].key) ? keys : undefined
    }
    const primary = t.primary.length > 0 ? keyed(t.primary) : undefined
    primaries[i] = primary
    // Foreign key columns take the type of the column they reference
    const linked = new Set<string>()
    const links: Array<Link> = []
    for (const key of t.keys) {
      const self = key.table === i
      const to = self ? primary : primaries[key.table]
      if (!to) continue
      const from = key.columns.slice(0, to.length).map(slot => `c${slot}`)
      if (from.length !== to.length) continue
      if (!from.every(name => own[name] && !linked.has(name))) continue
      if (self && from.some(name => to.includes(name))) continue
      const source = self ? kind : result.types[names[key.table]]
      for (const [j, name] of from.entries()) {
        linked.add(name)
        kind[name] = source[to[j]]
      }
      // MySQL refuses set null on a not null column, a primary key's too
      const held = (name: string) =>
        own[name].notNull || primary?.includes(name)
      const action = from.some(held) ? 0 : key.action
      links.push({...key, action, from, to})
    }
    result.types[name] = kind
    result.references[name] = links.map(link => names[link.table])
    result.primary[name] = primary
    result.columns[name] = own
    let self: any
    const other = (link: Link): any =>
      link.table === i ? self : result.tables[names[link.table]]
    const inline = new Map(
      links
        .filter(link => link.inline && link.from.length === 1)
        .map(link => [link.from[0], link])
    )
    const single = primary?.length === 1 && t.inline ? primary[0] : undefined
    const columns = Object.fromEntries(
      present.map(([key, c]) => {
        const type = kind[key]
        let column = type.column()
        if (c.notNull) column = column.notNull()
        if (c.fallback && type.fallback !== undefined)
          column = column.default(type.fallback)
        if (c.unique && type.key) column = column.unique()
        if (single === key) column = column.primaryKey()
        const link = inline.get(key)
        if (link)
          column = column.references(() => other(link)[link.to[0]], {
            onDelete: actions[link.action]
          })
        return [key, column]
      })
    )
    const schema = i === size - 1 ? target.schema : undefined
    self = table(
      name,
      columns,
      (t: any) => {
        const config: Record<string, unknown> = {}
        if (primary && !single)
          config[`${name}_pk`] = primaryKey(...primary.map(key => t[key]))
        for (const [j, ix] of spec[i]!.indexes.entries()) {
          const keys = keyed(ix.columns)
          if (!keys) continue
          const fields = keys.map(key => t[key])
          const id = `${name}_i${j}`
          config[id] =
            ix.unique && ix.constraint
              ? unique(id).on(...fields)
              : (ix.unique ? uniqueIndex() : index()).on(...fields)
        }
        for (const [j, link] of links.entries()) {
          if (inline.get(link.from[0]) === link) continue
          const to = other(link)
          config[`${name}_f${j}`] = foreignKey(
            ...link.from.map(name => t[name])
          ).references(...link.to.map(name => to[name]))
        }
        return config as any
      },
      schema
    )
    result.tables[name] = self
  }
  return result
}

// One call, a round trip per statement adds up on the wasm databases
async function run(db: Database, statements: Array<string>): Promise<void> {
  await db.run(sql.unsafe(statements.join(';\n')))
}

// Values compare as JSON, with bytes as arrays
function encode(row: Record<string, unknown>): string {
  return JSON.stringify(row, (_, value) => {
    if (value instanceof Uint8Array) return Array.from(value)
    if (typeof value === 'bigint') return String(value)
    if (value?.type === 'Buffer') return value.data
    return value
  })
}

async function rows(
  db: Database,
  t: Table,
  columns: Array<string>
): Promise<Array<string>> {
  const fields = Object.fromEntries(
    columns.map(name => [name, (t as any)[name]])
  )
  const selected = columns.length
    ? await db.select(fields).from(t)
    : await db.select({n: sql<number>`1`}).from(t)
  return selected.map(row => encode(row as any)).toSorted()
}

// Rows of A's tables, through the columns B defines with the same type
async function kept(
  db: Database,
  a: Built,
  b: Built,
  after: boolean
): Promise<Record<string, Array<string>>> {
  const result: Record<string, Array<string>> = {}
  for (const [name, t] of Object.entries(a.tables)) {
    const next = b.tables[name]
    const shared = Object.keys(a.columns[name]).filter(
      key => !next || b.types[name][key]?.name === a.types[name][key].name
    )
    result[name] = await rows(db, after && next ? next : t, shared)
  }
  return result
}

// Columns of A that B drops or changes to a type push doesn't count as
// wider, push may only do that without force when they hold no values
async function lost(db: Database, a: Built, b: Built): Promise<Array<string>> {
  const result: Array<string> = []
  for (const [name, t] of Object.entries(a.tables)) {
    if (!b.tables[name]) continue
    for (const [key, from] of Object.entries(a.types[name])) {
      const to = b.types[name][key]
      if (to && (to.name === from.name || from.widens?.includes(to.name)))
        continue
      const column = (t as any)[key]
      const [{n}] = await db.select({n: sql<number>`count(${column})`}).from(t)
      if (Number(n) > 0) result.push(`${name}.${key}`)
    }
  }
  return result
}

function omit(rows: Array<string>, column: string): Array<string> {
  return rows
    .map(text => {
      const {[column]: _, ...rest} = JSON.parse(text)
      return encode(rest)
    })
    .toSorted()
}

// A forced push fills the nulls of a column made not null with its default
function fill(
  before: Record<string, Array<string>>,
  b: Built
): Record<string, Array<string>> {
  return Object.fromEntries(
    Object.entries(before).map(([name, list]) => {
      const columns = b.columns[name] ?? {}
      const filled = list.map(text => {
        const row = JSON.parse(text)
        for (const key of Object.keys(row)) {
          const spec = columns[key]
          const fallback = b.types[name]?.[key]?.fallback
          const fills = spec?.notNull && spec.fallback && fallback !== undefined
          if (row[key] === null && fills)
            row[key] = JSON.parse(encode({v: fallback})).v
        }
        return encode(row)
      })
      return [name, filled.toSorted()]
    })
  )
}

function normalize(info: SchemaInfo, tables: Array<string>): unknown {
  const byName = (a: {name?: string}, b: {name?: string}) =>
    String(a.name) < String(b.name) ? -1 : 1
  return info.tables
    .filter(t => tables.includes(t.name))
    .toSorted(byName)
    .map((t: TableInfo) => ({
      ...t,
      columns: t.columns.toSorted(byName),
      // Push matches keys and foreign keys by their columns, a key renamed
      // keeps its old name
      primaryKey: t.primaryKey && {...t.primaryKey, name: undefined},
      uniques: t.uniques
        .map(({name, ...key}) => key)
        .toSorted((a, b) => (String(a.columns) < String(b.columns) ? -1 : 1)),
      indexes: t.indexes.toSorted(byName),
      foreignKeys: t.foreignKeys
        .map(({name, ...key}) => key)
        .toSorted((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))
    }))
}

// Rows drawn and rows that went in, so a run can tell when inserts fail
// across the board
interface Count {
  drawn: number
  kept: number
}

async function insert(
  tc: hegel.TestCase,
  db: Database,
  built: Built,
  inserted: Count
): Promise<void> {
  for (const [name, t] of Object.entries(built.tables)) {
    const keys = Object.keys(built.columns[name])
    const values = keys.map(key => {
      const gen = built.types[name][key].values
      return built.columns[name][key].notNull ? gen : gs.optional(gen)
    })
    const drawn = tc.draw(gs.arrays(gs.tuples(...values), {maxSize: 3}), name)
    for (const row of drawn) {
      const record = Object.fromEntries(keys.map((key, i) => [key, row[i]]))
      inserted.drawn++
      try {
        await db.insert(t).values(record as any)
        inserted.kept++
      } catch (error) {
        // Rows that break a constraint are left out, other errors are bugs
        if (!violation(error)) throw error
      }
    }
  }
}

interface DbError {
  message?: string
  code?: string
  errno?: number
  sqlState?: string
  sqlstate?: string
}

// A row that breaks a constraint, or a value the new type can't hold
export function violation(error: unknown): boolean {
  const {message = '', code, errno, sqlState, sqlstate} = error as DbError
  // Postgres puts the state in code, mysql2 puts its own name there
  const state = sqlState ?? sqlstate ?? code ?? ''
  if (/^2[23]/.test(state) || /^Cannot add not null column/.test(message))
    return true
  // MySQL sets HY000 on some of these, sqlite sets no state at all
  if (errno !== undefined && mysqlData.includes(errno)) return true
  return /constraint failed|datatype mismatch|^Push would violate foreign key/.test(
    message
  )
}

// Null, duplicate, foreign key, out of range, truncated or invalid values
const mysqlData = [
  1048, 1062, 1138, 1264, 1265, 1292, 1366, 1406, 1451, 1452, 3140
]

// A table left out of B may reference a key B changes, push refuses to
// break it, as does the database
function dangling(a: Built, b: Built, error: unknown): boolean {
  const {message = '', code, errno} = error as DbError
  const keyed =
    /foreign key mismatch|foreign key constraint .+ cannot be implemented/.test(
      message
    ) ||
    code === '2BP01' ||
    (errno !== undefined && [1553, 1822, 1828, 1829, 3780].includes(errno))
  return (
    keyed &&
    Object.keys(a.tables).some(
      name => !b.tables[name] && a.references[name].some(to => b.tables[to])
    )
  )
}

async function attempt(fn: () => unknown): Promise<unknown> {
  try {
    await fn()
  } catch (error) {
    return error
  }
}

export function fuzzPush<Context>(
  test: DefineTest<Context>,
  target: Target
): void {
  bun?.setDefaultTimeout(3_600_000)
  const {label, db, push} = target
  const spec = schemas(target.types.length)
  const pair = pairs(target.types.length)
  const inserted: Count = {drawn: 0, kept: 0}
  const reset = () => run(db, target.clean(names))
  const read = async (built: Built) =>
    normalize(await target.read(db), Object.keys(built.tables))
  const property = (name: string, fn: (tc: hegel.TestCase) => unknown) =>
    test(`${label}: ${name}`, async () => {
      try {
        await new hegel.Hegel(async tc => {
          await reset()
          await fn(tc)
        })
          .databaseKey(`${label}: push ${name}`)
          .settings({testCases: runs})
          .run()
      } finally {
        await reset()
      }
    })

  property('idempotent', async tc => {
    const a = build(target, tc.draw(spec, 'a'))
    tc.assume(Object.keys(a.tables).length > 0)
    await push(db, a.tables)
    test.equal(await push.plan(db, a.tables), [])
  })

  property('converges', async tc => {
    const [specA, specB] = tc.draw(pair, 'schemas')
    const a = build(target, specA)
    const b = build(target, specB)
    tc.assume(Object.keys(b.tables).length > 0)
    if (Object.keys(a.tables).length > 0) await push(db, a.tables)
    await insert(tc, db, a, inserted)
    const before = await kept(db, a, b, false)
    const held = await lost(db, a, b)
    const shape = await target.read(db)
    // Without force push applies the change without losing data, or
    // refuses it
    const refused = await attempt(() => push(db, b.tables))
    if (!refused) {
      test.equal(await kept(db, a, b, true), before)
      test.equal(held, [])
    } else {
      tc.note(`refused: ${refused}`)
      const {message = ''} = refused as DbError
      const risky = /^Push would /.test(message) || violation(refused)
      if (!risky && !dangling(a, b, refused)) throw refused
      if (target.atomic) {
        test.equal(await target.read(db), shape)
        test.equal(await kept(db, a, b, false), before)
      }
      if (dangling(a, b, refused)) return
      const forced = await attempt(() => push(db, b.tables, {force: true}))
      // Forced, a column that becomes sqlite's rowid takes the rowids
      const settled = (rows: Record<string, Array<string>>) =>
        Object.fromEntries(
          Object.entries(rows).map(([name, list]) => {
            const [key, ...rest] = b.primary[name] ?? []
            const rowid =
              key && !rest.length && b.types[name][key].name === target.rowid
            return [name, rowid ? omit(list, key) : list]
          })
        )
      if (!forced)
        test.equal(
          settled(await kept(db, a, b, true)),
          settled(fill(before, b))
        )
      else {
        // Rows can stop a forced push, such as duplicates for a new unique
        // key, then the change has to apply once they are gone
        tc.note(`forced: ${forced}`)
        if (dangling(a, b, forced)) return
        if (!violation(forced)) throw forced
        await reset()
        if (Object.keys(a.tables).length > 0) await push(db, a.tables)
        const failed = await attempt(() => push(db, b.tables, {force: true}))
        if (failed && !dangling(a, b, failed)) throw failed
        if (failed) return
      }
    }
    test.equal(await push.plan(db, b.tables), [])
    const pushed = await read(b)
    await reset()
    await push(db, b.tables)
    test.equal(pushed, await read(b))
  })

  // Converges is vacuous when every row it draws is refused
  test(`${label}: rows go in`, () => {
    test.equal(inserted.kept > inserted.drawn / 4, true)
  })

  property('generates', async tc => {
    const [specA, specB] = tc.draw(pair, 'schemas')
    const a = build(target, specA)
    const b = build(target, specB)
    tc.assume(Object.keys(b.tables).length > 0)
    const {shadow} = target
    const generate = async (files: Record<string, string>, built: Built) => {
      if (shadow) await run(shadow, target.clean(names))
      return target.generate(files, built.tables, {shadow})
    }
    const files: Record<string, string> = {}
    if (Object.keys(a.tables).length > 0)
      files['0001'] = await generate(files, a)
    let step = ''
    try {
      step = await generate(files, b)
    } catch (error) {
      if (!dangling(a, b, error)) throw error
      return
    }
    if (step) files['0002'] = step
    test.equal(await generate(files, b), '')
    await migrate(db, files)
    const migrated = await read(b)
    await reset()
    await push(db, b.tables)
    test.equal(migrated, await read(b))
  })
}

export function close<Context>(
  test: DefineTest<Context>,
  {label, db, shadow}: Target
): void {
  test(`${label}: close`, async () => {
    await db.driver.close()
    await shadow?.driver.close()
  })
}
