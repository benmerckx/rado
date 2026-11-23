import type {Database} from './Database.ts'
import {configEntries, isForeignKey, key} from './ForeignKey.ts'
import {
  type HasCreate,
  type HasDrop,
  type HasQuery,
  type HasTable,
  type HasTarget,
  type internalTable,
  getCreate,
  getData,
  getDrop,
  getQuery,
  getTable,
  getTarget,
  hasCreate,
  hasDrop,
  hasQuery,
  hasTable,
  hasTarget
} from './Internal.ts'
import type {Deliver, QueryDialect, QueryMeta, Runtime} from './MetaData.ts'
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
    result.push(group.toSorted((a, b) => items.indexOf(a) - items.indexOf(b)))
  }
  for (const item of items) if (!index.has(item)) connect(item)
  return result
}

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

type View = HasQuery & HasTarget

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function unquote(part: string): string {
  return part.replace(/^["`]|["`]$/g, '')
}

// A view's name in the sql of another, quoted or not. Names after a dot or
// as are columns and aliases, and a name before a parenthesis is a function.
function pattern(target: string): RegExp {
  const name = target
    .split('.')
    .map(part => `["\`]?${escape(unquote(part))}["\`]?`)
    .join('\\s*\\.\\s*')
  return new RegExp(
    `(?<!\\.\\s*|\\bas\\s+)(?<![\\w"\`])${name}(?![\\w"\`]|\\s*\\()`,
    'i'
  )
}

// Names a query gives its common table expressions, which shadow views
const ctes = /(?:\bwith\s+(?:recursive\s+)?|,\s*)["`]?(\w+)["`]?\s+as\s*\(/gi

function sources<V extends View>(
  views: Array<V>,
  text: (input: Sql) => string
): (view: V) => Array<V> {
  const names = new Map(
    views.map(view => {
      const target = text(getTarget(view))
      const name = unquote(target.split('.').at(-1)!).toLowerCase()
      return [view, {name, pattern: pattern(target)}]
    })
  )
  return view => {
    // A string can hold any name
    const query = text(getQuery(view)).replace(/'([^']|'')*'/g, "''")
    const local = new Set(
      Array.from(query.matchAll(ctes), match => match[1].toLowerCase())
    )
    return views.filter(other => {
      const {name, pattern} = names.get(other)!
      return other !== view && !local.has(name) && pattern.test(query)
    })
  }
}

// A view can't read from itself, through other views or not
function chain<V extends View>(
  views: Array<V>,
  text: (input: Sql) => string
): Array<V> {
  const groups = components(views, sources(views, text))
  const cycle = groups.find(group => group.length > 1)
  if (cycle) {
    const names = cycle.map(view => text(getTarget(view))).join(' and ')
    throw new Error(`Views form a cycle between ${names}`)
  }
  return groups.flat()
}

type Member = HasCreate & HasDrop

// A pgSchema, the one definition that names a target but isn't one to query
function isSchema(value: object): boolean {
  return hasTarget(value) && !hasTable(value) && !hasQuery(value)
}

export interface Members {
  has: (value: object) => boolean
  text: (input: Sql) => string
  // A schema object's pgSchema values are left out, dropping one cascades
  // to everything in it
  drop?: boolean
  // Refuse a foreign key cycle, where tables can't reference a table that
  // doesn't exist yet
  strict?: boolean
}

// The definitions of a schema object: schemas go first, then enums, then
// tables with referenced tables first, then views after the views they read
// from. Within a foreign key cycle, and where nothing depends on anything,
// the order given is kept.
export function members(
  schema: object,
  {has, text, drop, strict}: Members
): Array<Member> {
  if (hasTable(schema)) throw new Error('Expected a schema object, not a table')
  const values = Object.values(schema)
    .filter(isObject)
    .filter(has)
    .filter(value => !(drop && isSchema(value))) as Array<Member>
  if (values.length === 0) throw new Error('No definitions in schema')
  const distinct = values.filter((value, i) => values.indexOf(value) === i)
  const tables = distinct.filter(value => hasTable(value)) as Array<
    Member & HasTable
  >
  const apis = unique(tables.map(table => getTable(table)))
  const sorted = (
    strict ? order(apis) : components(apis, references(apis)).flat()
  ).map(api => tables.find(table => getTable(table) === api)!)
  const rest = distinct.filter(value => !hasTable(value))
  const views = rest.filter(value => hasQuery(value)) as Array<Member & View>
  const others = rest.filter(value => !hasQuery(value))
  const schemas = others.filter(isSchema)
  const enums = others.filter(value => !isSchema(value))
  return [...schemas, ...enums, ...sorted, ...chain(views, text)]
}

export interface Define<D extends QueryDialect = QueryDialect> {
  <Meta extends QueryMeta & {dialect: D}>(
    db: Database<Meta>,
    schema: Schema
  ): Deliver<Meta, void>
}

// Create and drop work out the order, db.create and db.drop keep the one
// given and stay out of this module
export function define<R extends Runtime>(
  runtime: R | undefined,
  drop: boolean
): Define<R> {
  return ((db: Database, schema: Schema) => {
    if (runtime && db.dialect.runtime !== runtime)
      throw new Error(`Expected a ${runtime} database`)
    const text = (input: Sql) => db.dialect.inline(input)
    // SQLite takes a reference to a table that doesn't exist yet
    const found = members(schema, {
      has: drop ? hasDrop : hasCreate,
      text,
      drop,
      strict: db.dialect.runtime !== 'sqlite'
    })
    const queries = drop
      ? found.toReversed().flatMap(getDrop)
      : found.flatMap(getCreate)
    const result = db.batch(queries).run()
    if (result instanceof Promise) return result.then(() => {})
  }) as Define<R>
}
