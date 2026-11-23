import {configEntries, isForeignKey, key} from './ForeignKey.ts'
import {
  type HasCreate,
  type HasDrop,
  type HasTable,
  type internalTable,
  getData,
  getTable,
  hasQuery,
  hasTable
} from './Internal.ts'
import type {TableApi} from './Table.ts'

// A module namespace or object literal, values that aren't tables are
// ignored. A table itself is not a schema.
export type Schema = Record<string, unknown> & {
  readonly [internalTable]?: never
}

const isObject = (value: unknown): value is object =>
  (typeof value === 'object' || typeof value === 'function') && value !== null

const named = (api: TableApi) =>
  api.schemaName ? `${api.schemaName}.${api.name}` : api.name

// Related and aliased tables share their columns with the table they derive
// from, so they count once
function unique(apis: Array<TableApi>): Array<TableApi> {
  return apis.filter((api, i) => {
    const first = apis.findIndex(
      other => other.name === api.name && other.schemaName === api.schemaName
    )
    if (first === i) return true
    if (apis[first].columns === api.columns) return false
    throw new Error(`Table "${named(api)}" is defined twice`)
  })
}

// The tables among an object's values, each once
export function tables(schema: Schema): Array<TableApi> {
  if (hasTable(schema)) throw new Error('Expected a schema object, not a table')
  const found = unique(
    Object.values(schema).filter(isObject).filter(hasTable).map(getTable)
  )
  if (found.length === 0) throw new Error('No tables in schema')
  return found
}

// The tables a table references, by key
function targets(api: TableApi): Array<string> {
  return [
    ...Object.values(api.columns).map(column => getData(column).references?.()),
    ...configEntries(api.config?.()).map(
      ([, value]) => isForeignKey(value) && getData(value).references[0]
    )
  ]
    .filter(field => field !== undefined && field !== false)
    .map(field => key(field.schemaName, field.targetName))
}

// Referenced tables first, so foreign keys can be created
export function order(tables: Array<TableApi>): Array<TableApi> {
  const byName = new Map(
    tables.map(api => [key(api.schemaName, api.name), api])
  )
  const result: Array<TableApi> = []
  const visiting = new Set<TableApi>()
  const visit = (api: TableApi) => {
    if (result.includes(api)) return
    visiting.add(api)
    for (const target of targets(api)) {
      const dependency = byName.get(target)
      if (!dependency || dependency === api) continue
      const pair = `"${dependency.name}" and "${api.name}"`
      if (visiting.has(dependency))
        throw new Error(`Foreign keys form a cycle between ${pair}`)
      visit(dependency)
    }
    visiting.delete(api)
    result.push(api)
  }
  for (const api of tables) visit(api)
  return result
}

// A foreign key cycle keeps the order given
function settle(apis: Array<TableApi>): Array<TableApi> {
  try {
    return order(apis)
  } catch {
    return apis
  }
}

type Member = HasCreate & HasDrop

// Arguments are definitions or schema objects whose definitions are picked
// out. Schemas and enums go first, then tables with referenced tables first,
// then views in the order given.
export function members(
  input: Array<object>,
  has: (value: object) => boolean
): Array<Member> {
  const values = input.flatMap(value => {
    if (has(value)) return [value as Member]
    const found = Object.values(value).filter(isObject).filter(has)
    if (found.length === 0) throw new Error('No definitions in schema')
    return found as Array<Member>
  })
  const distinct = values.filter((value, i) => values.indexOf(value) === i)
  const tables = distinct.filter(value => hasTable(value)) as Array<
    Member & HasTable
  >
  const views = distinct.filter(value => !hasTable(value) && hasQuery(value))
  const others = distinct.filter(value => !hasTable(value) && !hasQuery(value))
  const sorted = settle(unique(tables.map(table => getTable(table)))).map(api =>
    tables.find(table => getTable(table) === api)!
  )
  return [...others, ...sorted, ...views]
}
