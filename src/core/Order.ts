import {Emitter} from './Emitter.ts'
import {configEntries, isForeignKey, key} from './ForeignKey.ts'
import {
  type HasCreate,
  type HasDrop,
  type HasQuery,
  type HasTable,
  type HasTarget,
  type internalTable,
  getData,
  getQuery,
  getTable,
  getTarget,
  hasQuery,
  hasTable,
  hasTarget
} from './Internal.ts'
import type {Sql} from './Sql.ts'
import type {TableApi} from './Table.ts'

// A module namespace or object literal, values that aren't tables are
// ignored. A table itself is not a schema.
export type Schema = Record<string, unknown> & {
  readonly [internalTable]?: never
}

function isObject(value: unknown): value is object {
  return (
    (typeof value === 'object' || typeof value === 'function') && value !== null
  )
}

function named(api: TableApi): string {
  return api.schemaName ? `${api.schemaName}.${api.name}` : api.name
}

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

// Groups that depend on each other, dependencies first and each in the order
// given (Tarjan's strongly connected components)
function components<T>(
  items: Array<T>,
  dependencies: (item: T) => Array<T>
): Array<Array<T>> {
  const index = new Map<T, number>()
  const low = new Map<T, number>()
  const stack: Array<T> = []
  const result: Array<Array<T>> = []
  function connect(item: T): void {
    index.set(item, index.size)
    low.set(item, index.get(item)!)
    stack.push(item)
    for (const dependency of dependencies(item)) {
      if (!index.has(dependency)) connect(dependency)
      else if (!stack.includes(dependency)) continue
      low.set(item, Math.min(low.get(item)!, low.get(dependency)!))
    }
    if (low.get(item) !== index.get(item)) return
    const group = stack.splice(stack.indexOf(item))
    result.push(group.sort((a, b) => items.indexOf(a) - items.indexOf(b)))
  }
  for (const item of items) if (!index.has(item)) connect(item)
  return result
}

// The tables a table references
function references(tables: Array<TableApi>) {
  const byName = new Map(
    tables.map(api => [key(api.schemaName, api.name), api])
  )
  return (api: TableApi): Array<TableApi> =>
    [
      ...Object.values(api.columns).map(column =>
        getData(column).references?.()
      ),
      ...configEntries(api.config?.()).map(
        ([, value]) => isForeignKey(value) && getData(value).references[0]
      )
    ]
      .filter(field => field !== undefined && field !== false)
      .map(field => byName.get(key(field.schemaName, field.targetName))!)
      .filter(target => target && target !== api)
}

// Referenced tables first, so foreign keys can be created
export function order(tables: Array<TableApi>): Array<TableApi> {
  const groups = components(tables, references(tables))
  const cycle = groups.find(group => group.length > 1)
  if (cycle) {
    const names = cycle.map(api => `"${api.name}"`).join(' and ')
    throw new Error(`Foreign keys form a cycle between ${names}`)
  }
  return groups.flat()
}

// Collects the identifiers a query names
class Names extends Emitter {
  names = new Set<string>()
  emitIdentifier(value: string): void {
    this.names.add(value)
  }
  emitValue(): void {}
  emitInline(): void {}
  emitJsonPath(): void {}
  emitPlaceholder(): void {}
}

function identifiers(input: Sql): Set<string> {
  const names = new Names('sqlite')
  input.emit(names)
  return names.names
}

type View = HasQuery & HasTarget

// The views a view's query reads from, matched by name
function sources<V extends View>(views: Array<V>): (view: V) => Array<V> {
  const own = new Map(views.map(view => [view, identifiers(getTarget(view))]))
  return view => {
    const used = identifiers(getQuery(view))
    return views.filter(
      other => other !== view && [...own.get(other)!].every(n => used.has(n))
    )
  }
}

type Member = HasCreate & HasDrop

// Arguments are definitions or schema objects whose definitions are picked
// out. Schemas go first, then enums, then tables with referenced tables
// first, then views after the views they read from. Within a foreign key
// cycle, and where nothing depends on anything, the order given is kept.
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
  const apis = unique(tables.map(table => getTable(table)))
  const sorted = components(apis, references(apis))
    .flat()
    .map(api => tables.find(table => getTable(table) === api)!)
  const rest = distinct.filter(value => !hasTable(value))
  const views = rest.filter(value => hasQuery(value)) as Array<Member & View>
  const others = rest.filter(value => !hasQuery(value))
  const schemas = others.filter(value => hasTarget(value))
  const enums = others.filter(value => !hasTarget(value))
  return [
    ...schemas,
    ...enums,
    ...sorted,
    ...components(views, sources(views)).flat()
  ]
}
