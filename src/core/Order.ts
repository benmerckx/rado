import {foreignKeys, key} from './ForeignKey.ts'
import {
  type HasCreate,
  type HasDrop,
  getTable,
  hasQuery,
  hasTable
} from './Internal.ts'
import type {TableApi} from './Table.ts'

// The tables among an object's values, each once
export function tables(schema: object): Array<TableApi> {
  if (hasTable(schema)) throw new Error('Expected a schema object, not a table')
  const found: Array<TableApi> = []
  for (const value of Object.values(schema))
    if (isObject(value) && hasTable(value)) add(found, getTable(value))
  return found
}

// Related and aliased tables share their columns with the table they derive
// from, so they count once
function add(found: Array<TableApi>, api: TableApi): boolean {
  const same = found.find(
    other => other.name === api.name && other.schemaName === api.schemaName
  )
  if (!same) return found.push(api) > 0
  if (same.columns === api.columns) return false
  const name = api.schemaName ? `${api.schemaName}.${api.name}` : api.name
  throw new Error(`Table "${name}" is defined twice`)
}

const isObject = (value: unknown): value is object =>
  (typeof value === 'object' || typeof value === 'function') && value !== null

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
    for (const {schema, table} of foreignKeys(api)) {
      const dependency = byName.get(key(schema, table))
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

type Member = HasCreate & HasDrop

// Arguments are definitions or schema objects whose definitions are picked
// out. Schemas and enums go first, then tables with referenced tables first,
// then views. A foreign key cycle keeps the tables in the order given.
export function members(
  input: Array<object>,
  has: (value: object) => boolean
): Array<Member> {
  const values = input.flatMap(value =>
    has(value) ? [value] : Object.values(value).filter(isObject).filter(has)
  )
  const seen = new Set<object>()
  const found: Array<TableApi> = []
  const byApi = new Map<TableApi, Member>()
  const others: Array<Member> = []
  const views: Array<Member> = []
  for (const value of values as Array<Member>) {
    if (seen.has(value)) continue
    seen.add(value)
    if (hasTable(value)) {
      const api = getTable(value)
      if (add(found, api)) byApi.set(api, value)
    } else if (hasQuery(value)) views.push(value)
    else others.push(value)
  }
  let sorted = found
  try {
    sorted = order(found)
  } catch {}
  return [...others, ...sorted.map(api => byApi.get(api)!), ...views]
}
