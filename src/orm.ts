import {Builder} from './core/Builder.ts'
import {count as countExpr} from './core/expr/Aggregate.ts'
import {and, eq, exists, not} from './core/expr/Conditions.ts'
import type {Input} from './core/expr/Input.ts'
import {
  type HasRelation,
  type HasSql,
  type HasTable,
  getData,
  getField,
  getSql,
  getTable,
  hasRelation,
  hasSql,
  hasTable,
  internalBindRelation,
  internalRelation
} from './core/Internal.ts'
import type {Deliver, QueryMeta} from './core/MetaData.ts'
import type {Select} from './core/query/Select.ts'
import type {SelectionInput} from './core/Selection.ts'
import {sql, type Sql} from './core/Sql.ts'
import {
  alias,
  type SelectRow,
  type Table,
  type TableDefinition,
  type TableFields,
  type TableInsert,
  type TableUpdate
} from './core/Table.ts'

const {assign, entries, fromEntries, keys} = Object

type AnyTable = Table<TableDefinition>
type AnyModel = AnyTable & Record<string, unknown>
type RowOf<Model> =
  Model extends Table<infer Definition> ? SelectRow<Table<Definition>> : never

interface Through {
  table: AnyTable
  from: HasSql
  to: HasSql
}

interface RelationData {
  kind: 'one' | 'many'
  table: AnyTable
  from: HasSql
  to: HasSql
  alias?: string
  through?: Through
  direct: boolean
  count?: boolean
}

type RelationConfig =
  | Omit<RelationData, 'kind' | 'table' | 'direct'>
  | ((self: any) => Omit<RelationData, 'kind' | 'table' | 'direct'>)

type Scope = (from: AnyModel, to: AnyModel) => any

interface Relation<Model = unknown> extends HasRelation {
  (): Relation<Model>
  <Input>(scope: Scope): Relation<Input>
  select<Input extends SelectionInput>(select: Input): Relation<Input>
  where(where: HasSql<boolean>): Relation<Model>
  innerJoin(target: HasTable | HasSql, on: HasSql<boolean>): Relation<Model>
  orderBy(...orderBy: Array<HasSql>): Relation<Model>
  limit(limit: Input<number>): Relation<Model>
  offset(offset: Input<number>): Relation<Model>
  count(): Relation<number>
  some(where?: HasSql<boolean>): Sql<boolean>
  none(where?: HasSql<boolean>): Sql<boolean>
}

const dataOf = new WeakMap<Relation, RelationData>()
const scopeOf = new WeakMap<Relation, Scope>()

function tableOf(input: HasTable): AnyTable {
  if (!hasTable(input)) throw new Error('ORM helpers require a table')
  return input as AnyTable
}

export function columns<Model extends HasTable>(
  model: Model
): TableFields<any> {
  const table = getTable(tableOf(model))
  const names = new Set(keys(table.columns))
  return fromEntries(entries(model).filter(([key]) => names.has(key)))
}

function primaryKey(table: AnyTable): string {
  const {columns, name} = getTable(table)
  const found = entries(columns).find(([, column]) => getData(column).primary)
  if (!found) throw new Error(`Table ${name} has no primary key`)
  return found[0]
}

function fieldName(field: HasSql): string {
  return getField(field as any).fieldName
}

function fieldValue(field: HasSql, row: Record<string, unknown>): unknown {
  return row[fieldName(field)]
}

function rebase<T extends HasSql>(input: T, data: RelationData): T {
  const source = getTable(data.table).aliased
  return getSql(input).nameSelf(data.alias ?? source, source) as any
}

function rebaseInput(
  input: SelectionInput,
  data: RelationData
): SelectionInput {
  if (hasSql(input as any)) return rebase(input as HasSql, data)
  if (!input || typeof input !== 'object') return input
  return fromEntries(
    entries(input).map(([key, value]) => [key, rebaseInput(value, data)])
  )
}

function relationWhere(data: RelationData, left: HasSql): Sql<boolean> {
  const to = data.alias ? rebase(data.to, data) : data.to
  if (!data.through) return eq(to as any, left as any)
  return and(
    eq(data.through.from as any, left as any),
    eq(data.through.to as any, to as any)
  )
}

function relationQuery(data: RelationData, where?: HasSql<boolean>) {
  const from = data.through ? data.through.table : data.table
  return new Builder<QueryMeta>()
    .select(sql`1`)
    .from(from)
    .where(and(relationWhere(data, data.from), where))
}

function selectFrom(target: AnyModel) {
  return new Builder<QueryMeta>()
    .select()
    .from(target as AnyTable) as unknown as Select<unknown, QueryMeta>
}

function selectFields(target: AnyModel, select: SelectionInput) {
  return new Builder<QueryMeta>().select(select).from(target as AnyTable)
}

function selectable(target: AnyModel): AnyModel {
  return assign({}, target, {
    select: (select: SelectionInput) => selectFields(target, select),
    where: (...where: Array<HasSql<boolean> | undefined>) =>
      selectFrom(target).where(...where),
    innerJoin: (join: HasTable | HasSql, on: HasSql<boolean>) =>
      selectFrom(target).innerJoin(join as any, on),
    orderBy: (...orderBy: Array<HasSql>) =>
      selectFrom(target).orderBy(...orderBy),
    limit: (limit: Input<number>) => selectFrom(target).limit(limit),
    offset: (offset: Input<number>) => selectFrom(target).offset(offset)
  })
}

function rowModel(model: AnyModel, row: Record<string, unknown>): AnyModel {
  return fromEntries(
    entries(columns(model)).map(([key, field]) => [
      key,
      sql.value(row[fieldName(field as HasSql)]).as(fieldName(field as HasSql))
    ])
  ) as AnyModel
}

function scoped(scope: Scope | undefined, from: AnyModel, to: AnyModel) {
  return scope ? scope(from, to) : selectFrom(to)
}

function bind(config: RelationConfig, self: object) {
  return typeof config === 'function' ? config(self) : config
}

function makeRelation(data: RelationData, scope?: Scope): Relation {
  const rel = ((next?: Scope) =>
    next ? makeRelation(data, next) : rel) as Relation
  dataOf.set(rel, data)
  if (scope) scopeOf.set(rel, scope)
  assign(rel, {
    [internalRelation]: true,
    select(select: SelectionInput) {
      return makeRelation({...data, direct: false}, (from, to) =>
        scope
          ? scoped(scope, from, to)
          : selectFields(to, rebaseInput(select, data))
      )
    },
    where(where: HasSql<boolean>) {
      return makeRelation({...data, direct: false}, (from, to) =>
        scoped(scope, from, to).where(rebase(where, data))
      )
    },
    innerJoin(target: HasTable | HasSql, on: HasSql<boolean>) {
      return makeRelation({...data, direct: false}, (from, to) =>
        scoped(scope, from, to).innerJoin(target, rebase(on, data))
      )
    },
    orderBy(...orderBy: Array<HasSql>) {
      return makeRelation({...data, direct: false}, (from, to) =>
        scoped(scope, from, to).orderBy(
          ...orderBy.map(item => rebase(item, data))
        )
      )
    },
    limit(limit: Input<number>) {
      return makeRelation({...data, direct: false}, (from, to) =>
        scoped(scope, from, to).limit(limit)
      )
    },
    offset(offset: Input<number>) {
      return makeRelation({...data, direct: false}, (from, to) =>
        scoped(scope, from, to).offset(offset)
      )
    },
    count() {
      return makeRelation({...data, count: true, direct: false}, (_, to) =>
        selectFields(to, countExpr())
      )
    },
    some(where?: HasSql<boolean>) {
      return exists(relationQuery(data, where) as any)
    },
    none(where?: HasSql<boolean>) {
      return not(exists(relationQuery(data, where) as any))
    }
  })
  return rel
}

function relation<Model>(
  kind: RelationData['kind'],
  table: AnyTable,
  config: RelationConfig,
  self?: object
): Relation<Model> {
  const build = (self: object) =>
    makeRelation({kind, table, ...bind(config, self), direct: true})
  const empty = {}
  const rel = self ? build(self) : build(empty)
  if (!self) (rel as any)[internalBindRelation] = (self: object) => build(self)
  return rel
}

function selectInput(model: AnyModel, select?: SelectionInput): SelectionInput {
  return select ?? columns(model)
}

function relations(select: SelectionInput): Array<[string, Relation]> {
  if (!select || typeof select !== 'object' || hasSql(select as any)) return []
  return entries(select).filter((entry): entry is [string, Relation] =>
    hasRelation(entry[1] as any)
  )
}

function selectWithKeys(
  model: AnyModel,
  select?: SelectionInput
): [SelectionInput, Array<string>] {
  const input = selectInput(model, select)
  if (relations(input).length === 0) return [input, []]
  const hidden = entries(columns(model)).map(
    ([key, field]) => [`__${key}`, field] as const
  )
  return [
    {...fromEntries(hidden), ...(input as object)},
    hidden.map(([key]) => key)
  ]
}

function rowInput(model: AnyModel, input: Record<string, unknown>) {
  const names = new Set(keys(getTable(tableOf(model)).columns))
  return fromEntries(entries(input).filter(([key]) => names.has(key)))
}

function nested(input: Record<string, unknown>): Array<[string, any]> {
  return entries(input).filter(
    ([, value]) =>
      Array.isArray(value) || (!!value && typeof value === 'object')
  )
}

export function one<Model extends AnyTable>(
  table: Model,
  config: RelationConfig
): Relation<RowOf<Model> | null> {
  return relation('one', table, config)
}

export function many<Model extends AnyTable>(
  table: Model,
  config: RelationConfig
): Relation<Array<RowOf<Model>>> {
  return relation('many', table, config)
}

export class ORM<Meta extends QueryMeta> extends Builder<Meta> {
  transaction<T>(run: (tx: ORM<Meta>) => T): T {
    throw new Error('Transactions require a database')
  }

  find<Model extends HasTable>(options: {
    from: Model
    select?: SelectionInput
    where?: HasSql<boolean>
    orderBy?: HasSql | Array<HasSql>
    limit?: Input<number>
    offset?: Input<number>
  }): Deliver<Meta, Array<any>> {
    const model = tableOf(options.from)
    const [select, hidden] = selectWithKeys(options.from as any, options.select)
    let query = this.select(select).from(model).where(options.where)
    const orderBy = [options.orderBy].flat().filter(Boolean) as Array<HasSql>
    if (orderBy.length) query = query.orderBy(...orderBy)
    if (options.limit !== undefined) query = query.limit(options.limit)
    if (options.offset !== undefined) query = query.offset(options.offset)
    return this.hydrate(
      query,
      options.from as any,
      options.select,
      hidden
    ) as any
  }

  first<Model extends HasTable>(
    options: Parameters<ORM<Meta>['find']>[0]
  ): Deliver<Meta, any | null> {
    const result = this.find({...options, limit: 1})
    if (result instanceof Promise)
      return result.then(rows => rows[0] ?? null) as any
    return ((result as Array<any>)[0] ?? null) as any
  }

  count<Model extends HasTable>(options: {
    from: Model
    where?: HasSql<boolean>
  }): Deliver<Meta, number> {
    return this.select(countExpr())
      .from(tableOf(options.from))
      .where(options.where)
      .$first() as any
  }

  load(rel: Relation, key: unknown): Deliver<Meta, any> {
    const data = dataOf.get(rel)
    if (!data?.direct)
      throw new Error('db.load() only accepts a direct relation')
    const target = data.alias ? alias(data.table, data.alias) : data.table
    let query = this.select(columns(target)).from(target)
    if (data.through)
      query = query.innerJoin(
        data.through.table,
        eq(data.through.to as any, data.to as any)
      )
    query = query.where(relationWhere(data, sql.value(key)))
    const rows = this.hydrate(query, target, target)
    if (data.kind === 'many') return rows as any
    if (rows instanceof Promise)
      return rows.then(rows => rows[0] ?? null) as any
    return ((rows as Array<any>)[0] ?? null) as any
  }

  save<Model extends HasTable>(
    model: Model,
    input: TableInsert<any> & TableUpdate<any> & Record<string, any>
  ): Deliver<Meta, any> {
    return this.transaction((tx: ORM<Meta>) =>
      tx.saveGraph(model, input)
    ) as any
  }

  saveMany<Model extends HasTable>(
    model: Model,
    rows: Array<TableInsert<any> & TableUpdate<any> & Record<string, any>>
  ): Deliver<Meta, Array<any>> {
    return this.transaction((tx: ORM<Meta>) =>
      rows.map(row => tx.saveGraph(model, row))
    ) as any
  }

  destroy<Model extends HasTable>(
    model: Model,
    input: unknown
  ): Deliver<Meta, void> {
    const key = primaryKey(tableOf(model))
    const value =
      input && typeof input === 'object' ? (input as any)[key] : input
    return this.delete(tableOf(model))
      .where(eq((model as any)[key], value))
      .run() as any
  }

  private hydrate(
    query: any,
    model: AnyModel,
    select?: SelectionInput,
    hidden: Array<string> = []
  ): any {
    const rows = query.all(this as any)
    if (rows instanceof Promise)
      return rows.then(rows => this.hydrateRows(rows, model, select, hidden))
    return this.hydrateRows(rows as Array<any>, model, select, hidden)
  }

  private hydrateRows(
    rows: Array<any>,
    model: AnyModel,
    select?: SelectionInput,
    hidden: Array<string> = []
  ): any {
    for (const [name, rel] of relations(select ?? {})) {
      const values: Array<any> = rows.map(row =>
        this.loadFor(row, model, name, rel)
      )
      if (values.some((value: any) => value instanceof Promise))
        return Promise.all(values).then(values =>
          rows.map((row, index) => ({...row, [name]: values[index]}))
        )
      rows = rows.map((row, index) => ({...row, [name]: values[index]}))
    }
    if (hidden.length)
      rows = rows.map(row => {
        for (const key of hidden) delete row[key]
        return row
      })
    return rows
  }

  private loadFor(row: any, model: AnyModel, name: string, rel: Relation): any {
    const data = dataOf.get(rel)!
    const scope = scopeOf.get(rel)
    const target = data.alias ? alias(data.table, data.alias) : data.table
    const parent = {...row}
    for (const key of keys(getTable(tableOf(model)).columns))
      parent[key] = row[`__${key}`] ?? row[key]
    const query = scope
      ? scope(rowModel(model, parent), selectable(target) as any)
      : this.select(columns(target)).from(target)
    let scoped = query
    if (data.through) {
      scoped = scoped.innerJoin(
        data.through.table,
        eq(data.through.to as any, data.to as any)
      )
    }
    scoped = scoped.where(
      relationWhere(
        data,
        sql.value(
          row[`__${fieldName(data.from)}`] ?? fieldValue(data.from, row)
        )
      )
    )
    const selected = getData<any>(scoped).select as SelectionInput
    const rows = this.hydrate(scoped as Select<any, Meta>, target, selected)
    if (data.count) {
      if (rows instanceof Promise) return rows.then(rows => rows[0] ?? 0)
      return (rows as Array<any>)[0] ?? 0
    }
    if (data.kind === 'many') return rows
    if (rows instanceof Promise) return rows.then(rows => rows[0] ?? null)
    return (rows as Array<any>)[0] ?? null
  }

  private saveGraph(model: HasTable, input: Record<string, any>) {
    const table = tableOf(model)
    for (const [name, value] of nested(input)) {
      const rel = (model as any)[name] as Relation
      if (!hasRelation(rel)) continue
      const data = dataOf.get(rel)!
      if (data.kind !== 'one') continue
      const saved = this.saveGraph(data.table, value)
      input[fieldName(data.from)] = saved[fieldName(data.to)]
    }
    const key = primaryKey(table)
    const row = rowInput(model as any, input)
    let saved: any
    if (input[key] === undefined) {
      saved = ((this.insert(table).values(row) as any).returning() as any).get()
    } else {
      saved = (
        (
          this.update(table)
            .set(row)
            .where(eq((model as any)[key], input[key])) as any
        ).returning() as any
      ).get()
      if (!saved) throw new Error(`No row found for primary key ${input[key]}`)
    }
    const savedNested: Record<string, unknown> = {}
    for (const [name, value] of nested(input)) {
      const rel = (model as any)[name] as Relation
      if (!hasRelation(rel)) continue
      const data = dataOf.get(rel)!
      if (data.kind !== 'many') continue
      const savedValues = []
      for (const child of [value].flat()) {
        if (data.through) {
          const linked = this.saveGraph(data.table, child)
          savedValues.push(linked)
          ;(
            this.insert(data.through.table).values({
              [fieldName(data.through.from)]: saved[fieldName(data.from)],
              [fieldName(data.through.to)]: linked[fieldName(data.to)]
            }) as any
          ).run()
        } else {
          child[fieldName(data.to)] = saved[fieldName(data.from)]
          savedValues.push(this.saveGraph(data.table, child))
        }
      }
      savedNested[name] = Array.isArray(value) ? savedValues : savedValues[0]
    }
    const current = this.first({
      from: model,
      where: eq((model as any)[key], saved[key])
    })
    return assign(current, savedNested)
  }
}
