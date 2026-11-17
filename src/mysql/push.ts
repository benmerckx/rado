import {formatColumn} from '../core/Column.ts'
import type {Database} from '../core/Database.ts'
import {type HasSql, getData} from '../core/Internal.ts'
import {
  type ColumnInfo,
  type ForeignKeyInfo,
  type Gen,
  type Planner,
  type Step,
  type TableInfo,
  addForeignKey,
  columnData,
  exists,
  foreignKey,
  foreignKeys,
  renames,
  shadow,
  widens
} from '../core/Push.ts'
import {type Sql, sql} from '../core/Sql.ts'
import type {TableApi} from '../core/Table.ts'
import {mysqlDialect} from './dialect.ts'

const {entries, keys} = Object
const prefix = '__rado_'
const inline = (query: HasSql) => mysqlDialect.inline(query)
const quote = (name: string) => `\`${name.replaceAll('`', '``')}\``

interface ColumnRow {
  name: string
  type: string
  nullable: string
  value: string | null
  extra: string
}

interface KeyRow {
  name: string
  column: string | null
  non_unique: number | string
  collation: string | null
  sub_part: number | null
  expression: string | null
}

interface ForeignKeyRow {
  name: string
  column: string
  ref_table: string
  ref_column: string
  on_update: string
  on_delete: string
}

export function* inspect(
  tx: Database,
  name: string,
  renamed: Record<string, string> = {}
): Gen<TableInfo | undefined> {
  const as = (column: string) => renamed[column] ?? column
  const rows: Array<ColumnRow> = yield tx.all(sql`
    select column_name as name, column_type as type, is_nullable as nullable,
      column_default as value, extra as extra
    from information_schema.columns
    where table_schema = database() and table_name = ${name}
    order by ordinal_position
  `)
  if (rows.length === 0) return undefined
  const columns: Record<string, ColumnInfo> = {}
  for (const row of rows)
    columns[as(row.name)] = {
      type: row.type.toLowerCase(),
      notNull: row.nullable === 'NO',
      default: row.value,
      extra: row.extra.toLowerCase().replace('default_generated', '').trim()
    }
  const keyRows: Array<KeyRow> = yield tx.all(sql`
    select index_name as name, column_name as \`column\`, non_unique as non_unique,
      collation as collation, sub_part as sub_part, expression as expression
    from information_schema.statistics
    where table_schema = database() and table_name = ${name}
    order by index_name, seq_in_index
  `)
  const parts = new Map<string, {unique: boolean; columns: Array<string>}>()
  for (const row of keyRows) {
    const key = parts.get(row.name) ?? {
      unique: Number(row.non_unique) === 0,
      columns: []
    }
    const part = row.expression
      ? `(${row.expression})`
      : quote(as(row.column!)) + (row.sub_part ? `(${row.sub_part})` : '')
    key.columns.push(part + (row.collation === 'D' ? ' desc' : ''))
    parts.set(row.name, key)
  }
  const constraints: Record<string, string> = {}
  const indexes: Record<string, string> = {}
  for (const [key, {unique, columns}] of parts) {
    if (key === 'PRIMARY') constraints.primary = `primary key (${columns})`
    else indexes[key] = `${unique ? 'unique ' : ''}(${columns})`
  }
  const fkRows: Array<ForeignKeyRow> = yield tx.all(sql`
    select k.constraint_name as name, k.column_name as \`column\`,
      k.referenced_table_name as ref_table,
      k.referenced_column_name as ref_column,
      r.update_rule as on_update, r.delete_rule as on_delete
    from information_schema.key_column_usage k
    join information_schema.referential_constraints r
      on r.constraint_schema = k.constraint_schema
      and r.constraint_name = k.constraint_name
      and r.table_name = k.table_name
    where k.table_schema = database() and k.table_name = ${name}
      and k.referenced_table_name is not null
    order by k.constraint_name, k.ordinal_position
  `)
  const fks = new Map<string, ForeignKeyInfo>()
  for (const row of fkRows) {
    const fk = fks.get(row.name) ?? {
      name: row.name,
      columns: [],
      table: row.ref_table,
      references: [],
      onDelete: row.on_delete.toLowerCase(),
      onUpdate: row.on_update.toLowerCase()
    }
    fk.columns.push(as(row.column))
    fk.references.push(
      row.ref_table === name ? as(row.ref_column) : row.ref_column
    )
    fks.set(row.name, fk)
  }
  return {columns, constraints, indexes, foreignKeys: [...fks.values()]}
}

export const plan: Planner = function* (tx, api, options) {
  const before = yield* inspect(tx, api.name)
  if (!before) return api.create().map(query => ({sql: inline(query)}))
  const renamed: Record<string, string> = {}
  const steps: Array<Step> = []
  for (const [from, to] of renames(api, options)) {
    if (!before.columns[from]) continue
    if (before.columns[to])
      throw new Error(`Cannot rename "${from}" to "${to}", both exist`)
    renamed[from] = to
    steps.push({
      sql: inline(
        sql`alter table ${api.identifier()} rename column ${sql.identifier(
          from
        )} to ${sql.identifier(to)}`
      )
    })
  }
  const live = keys(renamed).length
    ? (yield* inspect(tx, api.name, renamed))!
    : before
  const copy = shadow(api, prefix + api.name)
  let desired: TableInfo
  yield tx.run(sql`drop table if exists ${copy.identifier()}`)
  try {
    yield tx.run(copy.createTable())
    for (const [name, index] of entries(api.indexes()))
      yield tx.run(getData(index).toSql(copy.name, name, false))
    desired = (yield* inspect(tx, copy.name))!
  } finally {
    yield tx.run(sql`drop table if exists ${copy.identifier()}`)
  }
  const original = Object.fromEntries(
    entries(renamed).map(([from, to]) => [to, from])
  )
  return [...steps, ...(yield* changes(tx, api, live, desired, original))]
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
  desired: TableInfo,
  original: Record<string, string>
): Gen<Array<Step>> {
  const target = api.identifier()
  const data = columnData(api)
  const source = (name: string) => sql.identifier(original[name] ?? name)
  const alter = (change: Sql, risk?: string): Step => ({
    sql: inline(sql`alter table ${target} ${change}`),
    risk
  })
  const drops: Array<Step> = []
  const alters: Array<Step> = []
  const adds: Array<Step> = []

  const wanted = foreignKeys(api)
  const current = new Set(live.foreignKeys.map(foreignKey))
  const kept = new Set(wanted.map(foreignKey))
  // MySQL adds an index for each foreign key that lacks one
  const implicit = new Set(
    live.foreignKeys
      .filter(fk => kept.has(foreignKey(fk)))
      .flatMap(fk => [fk.name!, fk.columns[0]])
      .filter(name => !desired.indexes[name])
  )
  for (const fk of live.foreignKeys)
    if (!kept.has(foreignKey(fk)))
      drops.push(alter(sql`drop foreign key ${sql.identifier(fk.name!)}`))
  for (const [name, def] of entries(live.indexes))
    if (!implicit.has(name) && desired.indexes[name] !== def)
      drops.push(alter(sql`drop index ${sql.identifier(name)}`))
  const primary = desired.constraints.primary
  if (live.constraints.primary && live.constraints.primary !== primary)
    drops.push(alter(sql`drop primary key`))

  const hasRows = yield* exists(tx, target)
  for (const name of keys(live.columns)) {
    if (desired.columns[name]) continue
    const risk =
      hasRows && (yield* exists(tx, target, sql`${source(name)} is not null`))
        ? `drop column "${name}" with data`
        : undefined
    drops.push(alter(sql`drop column ${sql.identifier(name)}`, risk))
  }

  for (const [name, to] of entries(desired.columns)) {
    const from = live.columns[name]
    const column = sql.identifier(name)
    const definition = formatColumn({
      ...data[name],
      primary: false,
      isUnique: false,
      references: undefined
    })
    if (!from) {
      if (to.notNull && to.default === null && !to.extra && hasRows)
        throw new Error(
          `Cannot add not null column "${name}" without a default to "${api.name}"`
        )
      alters.push(alter(sql`add column ${column} ${definition}`))
      continue
    }
    if (same(from, to)) continue
    let risk: string | undefined
    if (
      from.type !== to.type &&
      !widens(from.type, to.type) &&
      hasRows &&
      (yield* exists(tx, target, sql`${source(name)} is not null`))
    )
      risk = `change column "${name}" from ${from.type} to ${to.type}`
    if (
      to.notNull &&
      !from.notNull &&
      hasRows &&
      (yield* exists(tx, target, sql`${source(name)} is null`))
    ) {
      risk = `make column "${name}" not null over null values`
      if (data[name].defaultValue)
        alters.push({
          sql: inline(
            sql`update ${target} set ${column} = (${data[name].defaultValue}) where ${column} is null`.inlineValues()
          ),
          risk
        })
    }
    alters.push(alter(sql`modify column ${column} ${definition}`, risk))
  }

  if (primary && live.constraints.primary !== primary)
    adds.push(alter(sql.unsafe(`add ${primary}`)))
  for (const [name, def] of entries(desired.indexes)) {
    if (live.indexes[name] === def) continue
    const unique = def.startsWith('unique ')
    const columns = sql.unsafe(unique ? def.slice('unique '.length) : def)
    adds.push(
      alter(
        sql`add ${unique ? sql`unique ` : sql``}index ${sql.identifier(name)} ${columns}`
      )
    )
  }
  for (const fk of wanted)
    if (!current.has(foreignKey(fk)))
      adds.push(alter(sql`add ${addForeignKey(fk)}`))
  return [...drops, ...alters, ...adds]
}
