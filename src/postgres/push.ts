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
  renameSteps,
  scratch,
  shadow,
  widens
} from '../core/Push.ts'
import {type Sql, sql} from '../core/Sql.ts'
import type {TableApi} from '../core/Table.ts'
import {postgresDialect} from './dialect.ts'

const {entries, keys} = Object
const scratchSchema = 'rado_push'
const inline = (query: HasSql) => postgresDialect.inline(query)
const actions: Record<string, string> = {
  a: 'no action',
  r: 'restrict',
  c: 'cascade',
  n: 'set null',
  d: 'set default'
}

interface ColumnRow {
  name: string
  type: string
  notNull: boolean
  default: string | null
  identity: string
}

interface ForeignKeyRow {
  name: string
  column: string
  table: string
  reference: string
  onUpdate: string
  onDelete: string
}

export function* inspect(
  tx: Database,
  name: string,
  schema: string
): Gen<TableInfo | undefined> {
  const found: {oid: unknown} | null = yield tx.get(sql`
    select c.oid from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relname = ${name} and n.nspname = ${schema}
      and c.relkind in ('r', 'p')
  `)
  if (!found) return undefined
  const relation = sql`${sql.inline(String(found.oid))}::oid`
  // Objects outside the search path are printed with their schema
  const local = (text: string) =>
    text.replaceAll(`"${schema}".`, '').replaceAll(`${schema}.`, '')
  const rows: Array<ColumnRow> = yield tx.all(sql`
    select a.attname as name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
      a.attnotnull as "notNull",
      pg_catalog.pg_get_expr(d.adbin, d.adrelid) as default,
      a.attidentity::text as identity
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = ${relation} and a.attnum > 0 and not a.attisdropped
    order by a.attnum
  `)
  const columns: Record<string, ColumnInfo> = {}
  for (const row of rows)
    columns[row.name] = {
      type: local(row.type),
      notNull: Boolean(row.notNull),
      default: row.default && local(row.default),
      extra: row.identity ?? ''
    }
  const constraints: Record<string, string> = {}
  const constraintRows: Array<{name: string; def: string}> = yield tx.all(sql`
    select conname as name, pg_catalog.pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = ${relation} and contype in ('p', 'u')
  `)
  for (const row of constraintRows) constraints[row.name] = row.def
  const indexes: Record<string, string> = {}
  const indexRows: Array<{name: string; def: string}> = yield tx.all(sql`
    select i.relname as name, pg_catalog.pg_get_indexdef(x.indexrelid) as def
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    where x.indrelid = ${relation} and not exists (
      select 1 from pg_constraint con where con.conindid = x.indexrelid
        and con.conrelid = x.indrelid
    )
  `)
  for (const row of indexRows) {
    const unique = row.def.startsWith('CREATE UNIQUE') ? 'unique ' : ''
    indexes[row.name] = unique + row.def.slice(row.def.indexOf(' USING '))
  }
  const fkRows: Array<ForeignKeyRow> = yield tx.all(sql`
    select con.conname as name, a.attname as column, r.relname as table,
      ra.attname as reference, con.confupdtype::text as "onUpdate",
      con.confdeltype::text as "onDelete"
    from pg_constraint con
    join pg_class r on r.oid = con.confrelid
    cross join lateral unnest(con.conkey, con.confkey)
      with ordinality as k(num, ref, pos)
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.num
    join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = k.ref
    where con.conrelid = ${relation} and con.contype = 'f'
    order by con.conname, k.pos
  `)
  const fks = new Map<string, ForeignKeyInfo>()
  for (const row of fkRows) {
    const fk = fks.get(row.name) ?? {
      name: row.name,
      columns: [],
      table: row.table,
      references: [],
      onDelete: actions[row.onDelete],
      onUpdate: actions[row.onUpdate]
    }
    fk.columns.push(row.column)
    fk.references.push(row.reference)
    fks.set(row.name, fk)
  }
  return {columns, constraints, indexes, foreignKeys: [...fks.values()]}
}

export const plan: Planner = function* (tx, api, options) {
  const schema: string =
    api.schemaName ??
    ((yield tx.get(sql`select current_schema() as name`)) as {name: string})
      .name
  const before = yield* inspect(tx, api.name, schema)
  if (!before) return api.create().map(query => ({sql: inline(query)}))
  const renamed = renameSteps(api, before, options)
  return yield* scratch(tx, function* (sp) {
    for (const query of renamed) yield sp.run(query)
    const live =
      renamed.length > 0 ? (yield* inspect(sp, api.name, schema))! : before
    const enums: Array<Sql> = []
    for (const query of api.createEnums()) {
      const name = inline(query).match(/create type (.+?) as enum/)![1]
      const found = yield sp.get(sql`select to_regtype(${name}) as found`)
      if (!(found as {found: unknown}).found) enums.push(query)
    }
    const desired = yield* scratch(sp, function* (inner) {
      const {path}: {path: string} = yield inner.get(
        sql`select current_setting('search_path') as path`
      )
      yield inner.run(sql`create schema ${sql.identifier(scratchSchema)}`)
      yield inner.run(
        sql`set local search_path to ${sql.identifier(scratchSchema)}, ${sql.unsafe(path)}`
      )
      for (const query of api.createEnums()) yield inner.run(query)
      const copy = shadow(api, api.name, scratchSchema)
      yield inner.run(copy.createTable())
      for (const query of copy.createIndexes()) yield inner.run(query)
      return (yield* inspect(inner, api.name, scratchSchema))!
    })
    const target = sql`${sql.identifier(schema)}.${sql.identifier(api.name)}`
    const steps = yield* changes(sp, api, target, live, desired)
    return [
      ...enums.map(query => ({sql: inline(query)})),
      ...renamed.map(query => ({sql: inline(query)})),
      ...steps
    ]
  })
}

function* changes(
  tx: Database,
  api: TableApi,
  qualified: Sql,
  live: TableInfo,
  desired: TableInfo
): Gen<Array<Step>> {
  const target = api.identifier()
  const data = columnData(api)
  const alter = (change: Sql, risk?: string): Step => ({
    sql: inline(sql`alter table ${target} ${change}`),
    risk
  })
  const drops: Array<Step> = []
  const alters: Array<Step> = []
  const adds: Array<Step> = []

  for (const [name, def] of entries(live.indexes))
    if (desired.indexes[name] !== def) {
      const index = api.schemaName
        ? sql`${sql.identifier(api.schemaName)}.${sql.identifier(name)}`
        : sql.identifier(name)
      drops.push({sql: inline(sql`drop index ${index}`)})
    }
  const wanted = foreignKeys(api)
  const current = new Set(live.foreignKeys.map(foreignKey))
  const kept = new Set(wanted.map(foreignKey))
  for (const fk of live.foreignKeys)
    if (!kept.has(foreignKey(fk)))
      drops.push(alter(sql`drop constraint ${sql.identifier(fk.name!)}`))
  const defs = new Set(Object.values(desired.constraints))
  const liveDefs = new Set(Object.values(live.constraints))
  for (const [name, def] of entries(live.constraints))
    if (!defs.has(def))
      drops.push(alter(sql`drop constraint ${sql.identifier(name)}`))

  const hasRows = yield* exists(tx, qualified)
  for (const name of keys(live.columns)) {
    if (desired.columns[name]) continue
    const column = sql.identifier(name)
    const risk =
      hasRows && (yield* exists(tx, qualified, sql`${column} is not null`))
        ? `drop column "${name}" with data`
        : undefined
    drops.push(alter(sql`drop column ${column}`, risk))
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
    if (from.type !== to.type) {
      const risk =
        !widens(from.type, to.type) &&
        hasRows &&
        (yield* exists(tx, qualified, sql`${column} is not null`))
          ? `change column "${name}" from ${from.type} to ${to.type}`
          : undefined
      const type = sql.unsafe(to.type)
      alters.push(
        alter(
          sql`alter column ${column} type ${type} using ${column}::${type}`,
          risk
        )
      )
    }
    if (from.default !== to.default)
      alters.push(
        alter(
          to.default === null
            ? sql`alter column ${column} drop default`
            : sql`alter column ${column} set default ${sql.unsafe(to.default)}`
        )
      )
    if (from.extra !== to.extra) {
      const kind = sql.unsafe(to.extra === 'a' ? 'always' : 'by default')
      alters.push(
        alter(
          !to.extra
            ? sql`alter column ${column} drop identity`
            : from.extra
              ? sql`alter column ${column} set generated ${kind}`
              : sql`alter column ${column} add generated ${kind} as identity`
        )
      )
    }
    if (from.notNull !== to.notNull) {
      if (!to.notNull) {
        alters.push(alter(sql`alter column ${column} drop not null`))
        continue
      }
      const nulls =
        hasRows && (yield* exists(tx, qualified, sql`${column} is null`))
      if (nulls && data[name].defaultValue)
        alters.push({
          sql: inline(
            sql`update ${target} set ${column} = (${data[name].defaultValue}) where ${column} is null`.inlineValues()
          ),
          risk: `make column "${name}" not null over null values`
        })
      alters.push(
        alter(
          sql`alter column ${column} set not null`,
          nulls && !data[name].defaultValue
            ? `make column "${name}" not null over null values`
            : undefined
        )
      )
    }
  }

  for (const [name, def] of entries(desired.constraints))
    if (!liveDefs.has(def))
      adds.push(
        alter(sql`add constraint ${sql.identifier(name)} ${sql.unsafe(def)}`)
      )
  for (const fk of wanted)
    if (!current.has(foreignKey(fk)))
      adds.push(alter(sql`add ${addForeignKey(fk)}`))
  const indexes = api.indexes()
  for (const [name, def] of entries(desired.indexes))
    if (live.indexes[name] !== def)
      adds.push({
        sql: inline(getData(indexes[name]).toSql(api.name, name, false))
      })
  return [...drops, ...alters, ...adds]
}
