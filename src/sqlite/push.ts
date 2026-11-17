import {formatColumn} from '../core/Column.ts'
import type {Database} from '../core/Database.ts'
import {type HasSql, getData} from '../core/Internal.ts'
import {
  type ColumnInfo,
  type Gen,
  type Planner,
  type Step,
  type TableInfo,
  columnData,
  exists,
  foreignKey,
  foreignKeys,
  renameSteps,
  scratch,
  shadow,
  widens
} from '../core/Push.ts'
import {type Sql, sql} from '../core/Sql.ts'
import {type TableApi, primaryKeyColumns} from '../core/Table.ts'
import {sqliteDialect} from './dialect.ts'

const {entries, keys, values} = Object
const prefix = '__rado_'
const inline = (query: HasSql) => sqliteDialect.inline(query)
const constant =
  /^(null|true|false|[-+]?[\d.]+(e[-+]?\d+)?|'([^']|'')*'|x'[\da-f]*')$/i

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/["`[\]]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/ ?([(),=<>]) ?/g, '$1')
    .trim()
}

interface PragmaColumn {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

interface PragmaIndex {
  name: string
  unique: number
  origin: string
}

interface PragmaForeignKey {
  id: number
  table: string
  from: string
  to: string | null
  on_update: string
  on_delete: string
}

interface SchemaRow {
  type: string
  name: string
  sql: string | null
}

function pragma(name: string, target: string): Sql {
  return sql`select * from ${sql.unsafe(name)}(${sql.inline(target)})`
}

function* schema(tx: Database, where: Sql): Gen<Array<SchemaRow>> {
  return yield tx.all(
    sql`select type, name, sql from sqlite_master where ${where} order by rowid`
  )
}

export function* inspect(
  tx: Database,
  name: string,
  original = name
): Gen<TableInfo | undefined> {
  const rows: Array<PragmaColumn> = yield tx.all(
    pragma('pragma_table_info', name)
  )
  if (rows.length === 0) return undefined
  const master = yield* schema(tx, sql`tbl_name = ${sql.inline(name)}`)
  const tableSql = master.find(row => row.type === 'table')?.sql ?? ''
  const primary = rows
    .filter(row => row.pk > 0)
    .toSorted((a, b) => a.pk - b.pk)
    .map(row => row.name)
  const autoIncrement = /\bautoincrement\b/i.test(tableSql)
  const columns: Record<string, ColumnInfo> = {}
  for (const row of rows) {
    const value = row.dflt_value?.trim() ?? null
    columns[row.name] = {
      type: normalize(row.type),
      notNull: Boolean(row.notnull),
      default: value && (value.includes("'") ? value : value.toLowerCase()),
      extra: autoIncrement && primary[0] === row.name ? 'autoincrement' : ''
    }
  }
  const constraints: Record<string, string> = {}
  if (primary.length > 0) constraints.primary = `primary key (${primary})`
  const indexes: Record<string, string> = {}
  const list: Array<PragmaIndex> = yield tx.all(
    pragma('pragma_index_list', name)
  )
  for (const index of list) {
    if (index.origin === 'u') {
      const info: Array<{name: string}> = yield tx.all(
        pragma('pragma_index_info', index.name)
      )
      constraints[index.name] = `unique (${info.map(column => column.name)})`
    } else if (index.origin === 'c') {
      const text = normalize(
        master.find(row => row.name === index.name)?.sql ?? ''
      ).replace(' if not exists ', ' ')
      const head = normalize(`index ${index.name} on ${name}`)
      const def = text.slice(text.indexOf(head) + head.length)
      const key =
        name === original ? index.name : index.name.slice(prefix.length)
      indexes[key] = `${index.unique ? 'unique ' : ''}${def}`
    }
  }
  const fks: Array<PragmaForeignKey> = yield tx.all(
    pragma('pragma_foreign_key_list', name)
  )
  const foreignKeys = new Map<number, TableInfo['foreignKeys'][number]>()
  for (const fk of fks) {
    const entry = foreignKeys.get(fk.id) ?? {
      columns: [],
      table: fk.table,
      references: [],
      onDelete: fk.on_delete.toLowerCase(),
      onUpdate: fk.on_update.toLowerCase()
    }
    entry.columns.push(fk.from)
    entry.references.push(fk.to ?? '')
    foreignKeys.set(fk.id, entry)
  }
  return {columns, constraints, indexes, foreignKeys: [...foreignKeys.values()]}
}

export const plan: Planner = function* (tx, api, options) {
  const before = yield* inspect(tx, api.name)
  if (!before) return api.create().map(query => ({sql: inline(query)}))
  const renamed = renameSteps(api, before, options)
  return yield* scratch(tx, function* (sp) {
    for (const query of renamed) yield sp.run(query)
    const live = renamed.length > 0 ? (yield* inspect(sp, api.name))! : before
    const desired = yield* scratch(sp, function* (inner) {
      const copy = shadow(api, prefix + api.name)
      yield inner.run(copy.createTable())
      for (const [name, index] of entries(api.indexes()))
        yield inner.run(getData(index).toSql(copy.name, prefix + name, false))
      return (yield* inspect(inner, copy.name, api.name))!
    })
    const steps = yield* changes(sp, api, live, desired)
    return [...renamed.map(query => ({sql: inline(query)})), ...steps]
  })
}

function same(a: ColumnInfo, b: ColumnInfo): boolean {
  return (
    a.type === b.type &&
    a.notNull === b.notNull &&
    a.default === b.default &&
    a.extra === b.extra
  )
}

function* changes(
  tx: Database,
  api: TableApi,
  live: TableInfo,
  desired: TableInfo
): Gen<Array<Step>> {
  const target = api.identifier()
  const data = columnData(api)
  const wanted = foreignKeys(api)
  const current = new Set(live.foreignKeys.map(foreignKey))
  const missing = wanted.filter(fk => !current.has(foreignKey(fk)))
  const kept = new Set(wanted.map(foreignKey))
  const extra = live.foreignKeys.filter(fk => !kept.has(foreignKey(fk)))
  const dropped = keys(live.columns).filter(name => !desired.columns[name])
  const added = keys(desired.columns).filter(name => !live.columns[name])
  const changed = keys(desired.columns).filter(
    name =>
      live.columns[name] && !same(live.columns[name], desired.columns[name])
  )
  const hasRows = yield* exists(tx, target)
  const primary = primaryKeyColumns(api)
  const sorted = (info: TableInfo) => values(info.constraints).toSorted().join()
  const addable = (name: string) => {
    const column = desired.columns[name]
    if (column.notNull && column.default === null) {
      if (hasRows)
        throw new Error(
          `Cannot add not null column "${name}" without a default to "${api.name}"`
        )
      return false
    }
    if (primary.has(name)) return false
    if (hasRows && column.default && !constant.test(column.default))
      return false
    return !missing.some(fk => fk.columns.includes(name) && column.default)
  }
  const rebuild =
    changed.length > 0 ||
    extra.length > 0 ||
    sorted(live) !== sorted(desired) ||
    missing.some(fk => !fk.inline || !added.includes(fk.columns[0])) ||
    !added.every(addable)

  const risks = new Map<string, string>()
  if (hasRows) {
    for (const name of dropped)
      if (yield* exists(tx, target, sql`${sql.identifier(name)} is not null`))
        risks.set(name, `drop column "${name}" with data`)
    for (const name of changed) {
      const from = live.columns[name]
      const to = desired.columns[name]
      const column = sql.identifier(name)
      if (
        !widens(from.type, to.type) &&
        (yield* exists(tx, target, sql`${column} is not null`))
      )
        risks.set(
          name,
          `change column "${name}" from ${from.type} to ${to.type}`
        )
      if (
        to.notNull &&
        !from.notNull &&
        (yield* exists(tx, target, sql`${column} is null`))
      )
        risks.set(name, `make column "${name}" not null over null values`)
    }
  }

  if (rebuild) return yield* recreate(tx, api, live, desired, risks)

  const steps: Array<Step> = []
  for (const [name, def] of entries(live.indexes))
    if (desired.indexes[name] !== def)
      steps.push({sql: inline(sql`drop index ${sql.identifier(name)}`)})
  for (const name of dropped)
    steps.push({
      sql: inline(
        sql`alter table ${target} drop column ${sql.identifier(name)}`
      ),
      risk: risks.get(name)
    })
  for (const name of added)
    steps.push({
      sql: inline(
        sql`alter table ${target} add column ${sql.identifier(name)} ${formatColumn(data[name])}`
      )
    })
  const indexes = api.indexes()
  for (const [name, def] of entries(desired.indexes))
    if (live.indexes[name] !== def)
      steps.push({
        sql: inline(getData(indexes[name]).toSql(api.name, name, false))
      })
  return steps
}

// https://www.sqlite.org/lang_altertable.html#otheralter
function* recreate(
  tx: Database,
  api: TableApi,
  live: TableInfo,
  desired: TableInfo,
  risks: Map<string, string>
): Gen<Array<Step>> {
  const target = api.identifier()
  const temp = prefix + api.name
  const data = columnData(api)
  const triggers = yield* schema(
    tx,
    sql`type = 'trigger' and tbl_name = ${sql.inline(api.name)}`
  )
  const name = normalize(api.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mentions = new RegExp(`(^|[^\\w$])${name}([^\\w$]|$)`)
  const views = (yield* schema(tx, sql`type = 'view'`)).filter(view =>
    mentions.test(normalize(view.sql ?? ''))
  )
  const copied = keys(desired.columns).filter(name => live.columns[name])
  const selection = copied.map(name => {
    const from = live.columns[name]
    const to = desired.columns[name]
    let value: Sql = sql.identifier(name)
    if (from.type !== to.type && to.type)
      value = sql`cast(${value} as ${sql.unsafe(to.type)})`
    const fallback = data[name].defaultValue
    if (to.notNull && !from.notNull && fallback)
      value = sql`coalesce(${value}, ${fallback})`.inlineValues()
    return value
  })
  const list = (names: Array<string>) =>
    sql.join(names.map(sql.identifier), sql`, `)
  const risk = risks.values().next().value
  const steps: Array<Step> = [
    ...views.toReversed().map(view => ({
      sql: inline(sql`drop view ${sql.identifier(view.name)}`)
    })),
    {sql: inline(api.createTable(temp))}
  ]
  if (copied.length > 0)
    steps.push({
      sql: inline(
        sql`insert into ${sql.identifier(temp)} (${list(copied)}) select ${sql.join(
          selection,
          sql`, `
        )} from ${target}`
      ),
      risk
    })
  steps.push(
    {
      sql: inline(sql`drop table ${target}`),
      risk: copied.length > 0 ? undefined : risk,
      rebuild: true
    },
    {
      sql: inline(
        sql`alter table ${sql.identifier(temp)} rename to ${sql.identifier(api.name)}`
      )
    },
    ...api.createIndexes().map(query => ({sql: inline(query)})),
    ...[...triggers, ...views].map(row => ({sql: row.sql!}))
  )
  return steps
}
