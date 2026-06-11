import {Builder} from './core/Builder.ts'
import type {Column} from './core/Column.ts'
import type {Transaction} from './core/Database.ts'
import {count as countRows} from './core/expr/Aggregate.ts'
import {and, eq} from './core/expr/Conditions.ts'
import {Field, type FieldData} from './core/expr/Field.ts'
import {Include, type IncludeQuery} from './core/expr/Include.ts'
import type {Input} from './core/expr/Input.ts'
import {
  type HasSql,
  type HasTable,
  getData,
  getField,
  getTable,
  hasField,
  hasSql,
  internalData,
  internalSql
} from './core/Internal.ts'
import type {Deliver, QueryMeta} from './core/MetaData.ts'
import {Operation, type SingleQuery} from './core/Queries.ts'
import type {
  DeleteQuery,
  FromGuard,
  InsertQuery,
  Join,
  SelectionQuery,
  UpdateQuery
} from './core/query/Query.ts'
import {Select} from './core/query/Select.ts'
import type {SelectionInput} from './core/Selection.ts'
import {type Sql, sql} from './core/Sql.ts'
import {
  type Table,
  type TableApi,
  type TableDefinition,
  type TableInsert,
  type TableUpdate,
  alias,
  tableFields
} from './core/Table.ts'
import type {Expand} from './core/Types.ts'
import {txGenerator} from './universal/transactions.ts'

const {assign, entries, fromEntries, keys} = Object

type AnyRow = Record<string, unknown>
type TxPart<Meta extends QueryMeta> =
  | Promise<unknown>
  | ((tx: Transaction<Meta>) => unknown)
type TxGenerator<Meta extends QueryMeta, Result> = Generator<
  TxPart<Meta>,
  Result,
  any
>
type FirstSelectionQuery<Returning = SelectionInput> =
  SelectionQuery<Returning> & {first: true}

interface OrmDatabase<Meta extends QueryMeta> extends ORM<Meta> {
  transaction<T>(
    run: (tx: Transaction<Meta>) => T | Promise<T>,
    options?: unknown
  ): Deliver<Meta, T>
}


export interface RelationConfig {
  fields?: Array<HasSql>
  references?: Array<HasSql>
}

export interface ManyConfig extends RelationConfig {
  through?: Table
}

export type Shape =
  | HasSql
  | Table
  | Relation<any, any, any>
  | {[key: string]: Shape}

interface RelationData<
  Def extends TableDefinition = TableDefinition,
  Card extends 'one' | 'many' = 'one' | 'many',
  Shaped = Table<Def>
> extends SelectionQuery {
  card: Card
  target: Table
  config: ManyConfig
  shape: Shaped | undefined
}

type RelationLike = {readonly [internalData]: RelationData<any, any, any>}

function relationData<Card extends 'one' | 'many'>(
  card: Card,
  target: Table,
  config: ManyConfig = {}
): RelationData<TableDefinition, Card> {
  return {card, target, config, shape: undefined, select: undefined!, from: target}
}

function isRelation(value: unknown): value is RelationLike {
  if (!value || typeof value !== 'object') return false
  const data = (value as {readonly [internalData]?: Partial<RelationData>})[
    internalData
  ]
  return !!(
    data?.target &&
    data.config &&
    (data.card === 'one' || data.card === 'many')
  )
}

export abstract class Relation<
  Def extends TableDefinition = TableDefinition,
  Card extends 'one' | 'many' = 'one' | 'many',
  Shaped = Table<Def>
> extends Select<SelectionInput> {
  readonly [internalData]: RelationData<Def, Card, Shaped>

  protected constructor(data: RelationData<any, Card, any>) {
    super(data)
    this[internalData] = data as RelationData<Def, Card, Shaped>
  }
}

export class OneRelation<
  Def extends TableDefinition = TableDefinition,
  Shaped = Table<Def>
> extends Relation<Def, 'one', Shaped> {
  constructor(target: Table, config?: RelationConfig)
  constructor(data: RelationData<Def, 'one', Shaped>)
  constructor(
    targetOrData: Table | RelationData<Def, 'one', Shaped>,
    config: RelationConfig = {}
  ) {
    super(
      ('card' in targetOrData
        ? targetOrData
        : relationData('one', targetOrData, config))
    )
  }

  exists(): HasSql<boolean> {
    return lazy(() => {
      const data = getData(this)
      const link = resolveOne(undefined, this)
      const cond = combine(
        eq(link.targetField, link.parentField),
        data.where
      )
      const from = getTable(data.target).target()
      return sql<boolean>`exists (select 1 from ${from} where ${cond})`
    })
  }

  select<S extends Shape>(shape: S): OneRelation<Def, S> {
    return new OneRelation({
      ...getData(this),
      shape
    } as RelationData<Def, 'one', S>)
  }
}

export class ManyRelation<
  Def extends TableDefinition = TableDefinition,
  Shaped = Table<Def>
> extends Relation<Def, 'many', Shaped> {
  constructor(target: Table, config?: ManyConfig)
  constructor(data: RelationData<Def, 'many', Shaped>)
  constructor(
    targetOrData: Table | RelationData<Def, 'many', Shaped>,
    config: ManyConfig = {}
  ) {
    super(
      ('card' in targetOrData
        ? targetOrData
        : relationData('many', targetOrData, config))
    )
  }

  #parts(extra: Array<HasSql<boolean>>): {from: Sql; cond: HasSql<boolean>} {
    const data = getData(this)
    const conditions = extra.length
      ? and(data.where, ...extra)
      : data.where
    if (data.config.through) {
      const link = resolveThrough(undefined, this)
      const junction = getTable(data.config.through)
      const target = getTable(data.target)
      return {
        from: sql`${junction.target()} inner join ${target.target()} on ${eq(
          link.jTargetField,
          link.targetField
        )}`,
        cond: combine(eq(link.jParentField, link.parentField), conditions)
      }
    }
    const link = resolveMany(undefined, this)
    return {
      from: getTable(data.target).target(),
      cond: combine(eq(link.childField, link.parentField), conditions)
    }
  }

  count(): HasSql<number> {
    return lazy(() => {
      const {from, cond} = this.#parts([])
      return sql<number>`(select count(*) from ${from} where ${cond})`
    })
  }

  some(...conditions: Array<HasSql<boolean>>): HasSql<boolean> {
    return lazy(() => {
      const {from, cond} = this.#parts(conditions)
      return sql<boolean>`exists (select 1 from ${from} where ${cond})`
    })
  }

  none(...conditions: Array<HasSql<boolean>>): HasSql<boolean> {
    return lazy(() => {
      const {from, cond} = this.#parts(conditions)
      return sql<boolean>`not exists (select 1 from ${from} where ${cond})`
    })
  }

  select<S extends Shape>(shape: S): ManyRelation<Def, S> {
    return new ManyRelation({
      ...getData(this),
      shape
    } as RelationData<Def, 'many', S>)
  }
}

export function one<Def extends TableDefinition>(
  target: Table<Def>,
  config?: RelationConfig
): OneRelation<Def> {
  return new OneRelation(target as Table, config)
}

export function many<Def extends TableDefinition>(
  target: Table<Def>,
  config?: ManyConfig
): ManyRelation<Def> {
  return new ManyRelation(target as Table, config)
}


export type Model = object

type ModelInput<M extends Model> = M extends HasTable
  ? M
  : keyof DefinitionOfFields<M> extends never
    ? never
    : M

export type ModelDefinition<M> =
  M extends HasTable<infer Def, string> ? Def : DefinitionOfFields<M>

type RowOf<Def extends TableDefinition> = {
  [K in keyof Def]: Def[K] extends Column<
    infer T,
    [infer AllowsNull extends boolean, boolean]
  >
    ? [AllowsNull] extends [false]
      ? T
      : T | null
    : never
}

export type ModelRow<M> = Expand<RowOf<ModelDefinition<M>>>

type RelationsOf<M> = {
  [K in keyof M as M[K] extends Relation<any, any, any>
    ? K
    : never]: M[K]
}

export type ModelColumns<M> = {
  [K in keyof M as M[K] extends Relation<any, any, any>
    ? never
    : K extends string
      ? K
      : never]: M[K]
}

type ColumnFromFieldValue<Value> = Column<
  Exclude<Value, null>,
  [null extends Value ? true : false, false]
>

type DefinitionOfFields<M> = {
  [K in keyof ModelColumns<M> as ModelColumns<M>[K] extends HasSql
    ? K
    : never]: ModelColumns<M>[K] extends HasSql<infer Value>
    ? ColumnFromFieldValue<Value>
    : never
}

export function columns<M extends Model>(model: M): ModelColumns<M> {
  return fromEntries(
    entries(model).filter(([, value]) => !isRelation(value))
  ) as ModelColumns<M>
}


function lazy<T>(create: () => Sql<T>): HasSql<T> {
  return {
    get [internalSql]() {
      return create()
    }
  } as HasSql<T>
}

function combine(
  base: HasSql<boolean>,
  condition: HasSql<boolean> | undefined
): HasSql<boolean> {
  return condition ? and(base, condition) : base
}

function keyByFieldName(api: TableApi, fieldName: string): string {
  for (const [key, column] of entries(api.columns))
    if ((getData(column).name ?? key) === fieldName) return key
  throw new Error(`No column "${fieldName}" on table "${api.aliased}"`)
}

function fieldOf(api: TableApi, key: string): Field {
  const data = getData(api.columns[key])
  return new Field(api.aliased, data.name ?? key, data)
}

function fieldFrom(data: FieldData, targetName = data.targetName) {
  return new Field(targetName, data.fieldName, data.source)
}

function relationJoins(rel: RelationLike): Array<Join<HasTable | Sql>> {
  const from = getData(rel).from
  return Array.isArray(from)
    ? (from.slice(1) as Array<Join<HasTable | Sql>>)
    : []
}

function relationFrom(
  base:
    | HasTable
    | Sql
    | [HasTable | Sql, ...Array<Join<HasTable | Sql>>],
  rel: RelationLike
): FromGuard {
  const joins = relationJoins(rel)
  if (joins.length === 0) return base
  if (Array.isArray(base)) return [...base, ...joins]
  return [base, ...joins]
}

function fieldDataOf(field: HasSql): FieldData {
  if (!hasField(field)) throw new Error('Expected a column field')
  return getField(field)
}

function primaryKeyOf(api: TableApi): string {
  const found = entries(api.columns).filter(
    ([, column]) => getData(column).primary
  )
  if (found.length === 1) return found[0][0]
  if (found.length === 0)
    throw new Error(`Table "${api.aliased}" has no primary key column`)
  throw new Error(
    `Table "${api.aliased}" has a composite primary key, which is not supported`
  )
}

function resolveOne(
  parentApi: TableApi | undefined,
  rel: RelationLike,
  targetAlias?: string
) {
  const data = getData(rel)
  const targetApi = getTable(data.target)
  const {fields, references} = data.config
  let parentData: FieldData
  let refData: FieldData
  if (fields?.length && references?.length) {
    parentData = fieldDataOf(fields[0])
    refData = fieldDataOf(references[0])
  } else {
    if (!parentApi)
      throw new Error(
        `Cannot infer the foreign key of one(${targetApi.aliased}) here — pass fields/references`
      )
    const candidates = entries(parentApi.columns).filter(
      ([, column]) =>
        getData(column).references?.().targetName === targetApi.aliased
    )
    if (candidates.length === 0)
      throw new Error(
        `No column of "${parentApi.aliased}" references "${targetApi.aliased}" — pass fields/references to one()`
      )
    if (candidates.length > 1)
      throw new Error(
        `Multiple columns of "${parentApi.aliased}" reference "${targetApi.aliased}" — pass fields/references to one()`
      )
    const [key, column] = candidates[0]
    const data = getData(column)
    parentData = {
      targetName: parentApi.aliased,
      fieldName: data.name ?? key,
      source: data
    }
    refData = data.references!()
  }
  return {
    parentKey: parentApi
      ? keyByFieldName(parentApi, parentData.fieldName)
      : undefined,
    parentField: fieldFrom(parentData),
    targetKey: keyByFieldName(targetApi, refData.fieldName),
    targetField: fieldFrom(refData, targetAlias ?? refData.targetName)
  }
}

function resolveMany(
  parentApi: TableApi | undefined,
  rel: RelationLike,
  targetAlias?: string
) {
  const data = getData(rel)
  const targetApi = getTable(data.target)
  const {fields, references} = data.config
  let childData: FieldData
  let refData: FieldData
  if (fields?.length && references?.length) {
    childData = fieldDataOf(fields[0])
    refData = fieldDataOf(references[0])
  } else {
    const candidates = entries(targetApi.columns).filter(([, column]) => {
      const ref = getData(column).references?.()
      if (!ref) return false
      if (!parentApi) return true
      return (
        ref.targetName === parentApi.aliased ||
        ref.targetName === parentApi.name
      )
    })
    if (candidates.length === 0)
      throw new Error(
        `No column of "${targetApi.aliased}" references ${
          parentApi ? `"${parentApi.aliased}"` : 'a parent table'
        } — pass fields/references to many()`
      )
    if (candidates.length > 1)
      throw new Error(
        `Multiple columns of "${targetApi.aliased}" reference ${
          parentApi ? `"${parentApi.aliased}"` : 'parent tables'
        } — pass fields/references to many()`
      )
    const [key, column] = candidates[0]
    const data = getData(column)
    childData = {
      targetName: targetApi.aliased,
      fieldName: data.name ?? key,
      source: data
    }
    refData = data.references!()
  }
  return {
    childKey: keyByFieldName(targetApi, childData.fieldName),
    childField: fieldFrom(childData, targetAlias ?? childData.targetName),
    parentKey: parentApi
      ? keyByFieldName(parentApi, refData.fieldName)
      : undefined,
    parentField: fieldFrom(refData)
  }
}

function resolveThrough(
  parentApi: TableApi | undefined,
  rel: RelationLike
) {
  const data = getData(rel)
  const junction = data.config.through!
  const jApi = getTable(junction)
  const targetApi = getTable(data.target)
  const refs = entries(jApi.columns).flatMap(([key, column]) => {
    const ref = getData(column).references?.()
    return ref ? [{key, column, ref}] : []
  })
  const targetLinks = refs.filter(
    ({ref}) => ref.targetName === targetApi.aliased
  )
  if (targetLinks.length !== 1)
    throw new Error(
      `Expected exactly one column of "${jApi.aliased}" to reference "${targetApi.aliased}"`
    )
  const parentLinks = refs.filter(({ref}) =>
    parentApi
      ? ref.targetName === parentApi.aliased ||
        ref.targetName === parentApi.name
      : ref.targetName !== targetApi.aliased
  )
  if (parentLinks.length !== 1)
    throw new Error(
      `Expected exactly one column of "${jApi.aliased}" to reference the parent table`
    )
  const target = targetLinks[0]
  const parent = parentLinks[0]
  const targetData = getData(target.column)
  const parentData = getData(parent.column)
  return {
    jParentKey: parent.key,
    jParentField: new Field(jApi.aliased, parentData.name ?? parent.key, parentData),
    parentKey: parentApi
      ? keyByFieldName(parentApi, parent.ref.fieldName)
      : undefined,
    parentField: fieldFrom(parent.ref),
    jTargetKey: target.key,
    jTargetField: new Field(jApi.aliased, targetData.name ?? target.key, targetData),
    targetKey: keyByFieldName(targetApi, target.ref.fieldName),
    targetField: fieldFrom(target.ref)
  }
}


function remapFields(shape: Shape, fromName: string, toName: string): Shape {
  if (shape instanceof Field) {
    const data = getField(shape)
    if (data.targetName === fromName)
      return new Field(toName, data.fieldName, data.source)
    return shape
  }
  if (isRelation(shape)) return shape
  if (hasSql(shape as object)) return shape
  if (shape && typeof shape === 'object')
    return fromEntries(
      entries(shape).map(([key, value]) => [
        key,
        remapFields(value as Shape, fromName, toName)
      ])
    ) as Shape
  return shape
}

function relationInclude(
  rel: RelationLike,
  parentApi: TableApi
): Include<unknown> {
  const data = getData(rel)
  const targetApi = getTable(data.target)
  const through = data.config.through
  let target = data.target
  let targetAlias: string | undefined
  if (!through && targetApi.aliased === parentApi.aliased) {
    targetAlias = `${targetApi.aliased}_${data.card}`
    target = alias(data.target, targetAlias)
  }
  const innerApi = getTable(target)
  const fields = tableFields(innerApi.aliased, innerApi.columns)
  const given =
    data.shape && targetAlias
      ? remapFields(data.shape, targetApi.aliased, targetAlias)
      : data.shape
  const select = given ? compileShape(given, innerApi) : fields
  let from: FromGuard
  let cond: HasSql<boolean>
  if (through) {
    const link = resolveThrough(parentApi, rel)
    from = relationFrom(
      [
        through,
        {innerJoin: data.target, on: eq(link.jTargetField, link.targetField)}
      ],
      rel
    )
    cond = eq(link.jParentField, link.parentField)
  } else if (data.card === 'one') {
    const link = resolveOne(parentApi, rel, targetAlias)
    from = relationFrom(target, rel)
    cond = eq(link.targetField, link.parentField)
  } else {
    const link = resolveMany(parentApi, rel, targetAlias)
    from = relationFrom(target, rel)
    cond = eq(link.childField, link.parentField)
  }
  const query: IncludeQuery = {
    ...data,
    select,
    from,
    where: combine(cond, data.where),
    first: data.card === 'one'
  }
  return new Include(query)
}

function compileShape(shape: Shape, parentApi: TableApi): SelectionInput {
  if (isRelation(shape))
    return relationInclude(shape, parentApi) as SelectionInput
  if (hasSql(shape as object)) return shape as SelectionInput
  if (shape && typeof shape === 'object')
    return fromEntries(
      entries(shape).map(([key, value]) => [
        key,
        compileShape(value as Shape, parentApi)
      ])
    ) as SelectionInput
  throw new Error('Invalid select shape')
}


export type ShapeRow<In> =
  In extends Relation<any, 'many', infer S>
    ? Array<ShapeRow<S>>
    : In extends Relation<any, 'one', infer S>
      ? ShapeRow<S> | null
      : In extends HasSql<infer Value>
        ? Value
        : In extends object
          ? Expand<{
              [K in keyof In as K extends string ? K : never]: ShapeRow<In[K]>
            }>
          : never

export interface FindOptions<M extends Model, S extends Shape | undefined> {
  from: M
  select?: S
  where?: HasSql<boolean> | Array<HasSql<boolean>>
  orderBy?: HasSql | Array<HasSql>
  limit?: number
  offset?: number
}

export type ResultOf<M, S> = [S] extends [undefined] ? ModelRow<M> : ShapeRow<S>

export abstract class ORM<Meta extends QueryMeta> extends Builder<Meta> {
  find<M extends Model, S extends Shape | undefined = undefined>(
    options: FindOptions<ModelInput<M>, S>
  ): SingleQuery<Array<ResultOf<M, S>>, Meta> {
    const api = getTable(options.from as HasTable)
    const {orderBy, where} = options
    return this.$query({
      select: options.select
        ? compileShape(options.select, api)
        : tableFields(api.aliased, api.columns),
      from: options.from as unknown as Table,
      where: Array.isArray(where) ? and(...where) : where,
      orderBy: orderBy && (Array.isArray(orderBy) ? orderBy : [orderBy]),
      limit: options.limit,
      offset: options.offset
    } as SelectionQuery) as unknown as SingleQuery<Array<ResultOf<M, S>>, Meta>
  }

  first<M extends Model, S extends Shape | undefined = undefined>(
    options: FindOptions<ModelInput<M>, S>
  ): SingleQuery<ResultOf<M, S> | null, Meta> {
    const api = getTable(options.from as HasTable)
    const {orderBy, where} = options
    return this.$query({
      select: options.select
        ? compileShape(options.select, api)
        : tableFields(api.aliased, api.columns),
      from: options.from as unknown as Table,
      where: Array.isArray(where) ? and(...where) : where,
      orderBy: orderBy && (Array.isArray(orderBy) ? orderBy : [orderBy]),
      limit: 1,
      offset: options.offset,
      first: true
    } as FirstSelectionQuery) as unknown as SingleQuery<
      ResultOf<M, S> | null,
      Meta
    >
  }

  count<M extends Model>(
    options: Pick<FindOptions<ModelInput<M>, undefined>, 'from' | 'where'>
  ): SingleQuery<number, Meta> {
    const {where} = options
    return this.$query({
      select: countRows(),
      from: options.from as unknown as Table,
      where: Array.isArray(where) ? and(...where) : where,
      first: true
    } as FirstSelectionQuery) as unknown as SingleQuery<number, Meta>
  }

  save<M extends Model, In extends Graph<M>>(
    model: ModelInput<M>,
    input: In
  ): Save<M, In, Meta> {
    return new Save(this as unknown as OrmDatabase<Meta>, model as M, input)
  }

  saveMany<M extends Model, In extends Graph<M>>(
    model: ModelInput<M>,
    inputs: Array<In>
  ): Operation<Array<Persisted<M, In>>, Meta> {
    const db = this as unknown as OrmDatabase<Meta>
    return new Operation(
      () =>
        db.transaction(
          txGenerator(function* (tx) {
            const out: Array<AnyRow> = []
            for (const row of inputs)
              out.push(
                yield* saveGraph(
                  tx,
                  model as unknown as HasTable,
                  row as AnyRow,
                  []
                )
              )
            return out
          })
        ) as Deliver<Meta, Array<Persisted<M, In>>>
    )
  }

  destroy<M extends Model>(
    model: ModelInput<M>,
    entity: Input<number | string> | Partial<ModelRow<M>>
  ): SingleQuery<unknown, Meta> {
    const api = getTable(model as HasTable)
    const pkKey = primaryKeyOf(api)
    const pk =
      entity !== null && typeof entity === 'object' && !hasSql(entity)
        ? (entity as AnyRow)[pkKey]
        : entity
    if (pk === undefined || pk === null)
      throw new Error('destroy() requires a primary key value')
    return this.$query({
      delete: model as unknown as Table<TableDefinition>,
      where: eq(fieldOf(api, pkKey), pk as Input<number | string>)
    }) as SingleQuery<unknown, Meta>
  }
}


export type GraphRow<Def extends TableDefinition> =
  | TableInsert<Def>
  | TableUpdate<Def>

export type Graph<M> = GraphRow<ModelDefinition<M>> & {
  readonly [K in keyof RelationsOf<M>]?: RelationsOf<M>[K] extends Relation<
    infer Def,
    'many',
    any
  >
    ? Array<GraphRow<Def>>
    : RelationsOf<M>[K] extends Relation<infer Def, 'one', any>
      ? GraphRow<Def> | null
      : never
}

export type Persisted<M, In> = Expand<
  ModelRow<M> & {
    [K in Extract<
      keyof In,
      keyof RelationsOf<M>
    >]: RelationsOf<M>[K] extends Relation<infer Def, 'many', any>
      ? Array<Expand<RowOf<Def>>>
      : RelationsOf<M>[K] extends Relation<infer Def, 'one', any>
        ? Expand<RowOf<Def>> | null
        : never
  }
>

type Op =
  | {kind: 'add'; relation: Relation; row: AnyRow}

function modelRelations(model: object): Array<[string, Relation]> {
  return entries(model).filter(
    (entry): entry is [string, Relation] => isRelation(entry[1])
  )
}

function* saveGraph<Meta extends QueryMeta>(
  tx: ORM<Meta>,
  model: HasTable,
  inputRow: AnyRow,
  ops: Array<Op>
): TxGenerator<Meta, AnyRow> {
  const api = getTable(model)
  const pkKey = primaryKeyOf(api)
  const rels = modelRelations(model)
  const isUpdate = inputRow[pkKey] !== undefined && inputRow[pkKey] !== null
  const result: AnyRow = {}

  const values: AnyRow = {}
  for (const key of keys(api.columns))
    if (inputRow[key] !== undefined) values[key] = inputRow[key]

  for (const [key, rel] of rels) {
    const relData = getData(rel)
    if (relData.card !== 'one') continue
    const fromInput = key in inputRow && inputRow[key] !== undefined
    if (!fromInput) continue
    const child = inputRow[key] as AnyRow | null
    const link = resolveOne(api, rel)
    if (child === null) {
      values[link.parentKey!] = null
      if (fromInput) result[key] = null
    } else {
      const saved = yield* saveGraph(tx, relData.target, child, [])
      values[link.parentKey!] = saved[link.targetKey]
      if (fromInput) result[key] = saved
    }
  }

  const returning = tableFields(api.aliased, api.columns)
  const pkField = fieldOf(api, pkKey)
  const table = model as unknown as Table<TableDefinition>
  let row: AnyRow
  if (isUpdate) {
    const pk = inputRow[pkKey]
    const set = {...values}
    delete set[pkKey]
    if (keys(set).length > 0) {
      const query: UpdateQuery<typeof returning> = {
        update: table,
        set: set as TableUpdate<TableDefinition>,
        where: eq(pkField, pk),
        returning
      }
      const rows = (yield* tx.$query(query)) as unknown as Array<AnyRow>
      row = rows[0]
    } else {
      const query: FirstSelectionQuery<typeof returning> = {
        select: returning,
        from: table,
        where: eq(pkField, pk),
        first: true
      }
      row = (yield* tx.$query(query)) as unknown as AnyRow
    }
    if (!row)
      throw new Error(`No row in "${api.aliased}" with primary key ${pk}`)
  } else {
    const query: InsertQuery<typeof returning> = {
      insert: table,
      values: values as TableInsert<TableDefinition>,
      returning
    }
    const rows = (yield* tx.$query(query)) as unknown as Array<AnyRow>
    row = rows[0]
  }
  assign(result, row)

  for (const [key, rel] of rels) {
    const relData = getData(rel)
    if (relData.card !== 'many') continue
    const fromInput = key in inputRow && Array.isArray(inputRow[key])
    const relOps = ops.filter(op => op.relation === rel)
    if (!fromInput && relOps.length === 0) continue
    const inputRows = fromInput ? (inputRow[key] as Array<AnyRow>) : []
    const toSave: Array<AnyRow> = [
      ...inputRows,
      ...relOps.map(op => op.row)
    ]
    const saved: Array<AnyRow> = []
    for (const childRow of toSave)
      saved.push(yield* saveRelated(tx, api, rel, row, childRow))
    if (fromInput || relOps.length > 0) result[key] = saved
  }

  return result
}

function* saveRelated<Meta extends QueryMeta>(
  tx: ORM<Meta>,
  parentApi: TableApi,
  rel: Relation,
  parentRow: AnyRow,
  childRow: AnyRow
): TxGenerator<Meta, AnyRow> {
  const relData = getData(rel)
  if (relData.config.through) {
    const link = resolveThrough(parentApi, rel)
    const junction = relData.config.through!
    const jApi = getTable(junction)
    const target: AnyRow = yield* saveGraph(tx, relData.target, childRow, [])
    const parentValue = parentRow[link.parentKey!]
    const targetValue = target[link.targetKey]
    const junctionFields = tableFields(jApi.aliased, jApi.columns)
    const selectJunction: FirstSelectionQuery<typeof junctionFields> = {
      select: junctionFields,
      from: junction,
      where: and(
        eq(link.jParentField, parentValue),
        eq(link.jTargetField, targetValue)
      ),
      first: true
    }
    const existing = (yield* tx.$query(selectJunction)) as AnyRow | null
    if (!existing)
      yield* tx.$query({
        insert: junction as unknown as Table<TableDefinition>,
        values: {
          [link.jParentKey]: parentValue,
          [link.jTargetKey]: targetValue
        } as TableInsert<TableDefinition>
      })
    return target
  }
  const link = resolveMany(parentApi, rel)
  return yield* saveGraph(
    tx,
    relData.target,
    {...childRow, [link.childKey]: parentRow[link.parentKey!]},
    []
  )
}

export class Save<
  M extends Model,
  In,
  Meta extends QueryMeta
> extends Operation<Persisted<M, In>, Meta> {
  #db: OrmDatabase<Meta>
  #model: M
  #input: In
  #ops: Array<Op>

  constructor(db: OrmDatabase<Meta>, model: M, input: In, ops: Array<Op> = []) {
    super(
      () =>
        db.transaction(
          txGenerator(function* (tx) {
            return yield* saveGraph(
              tx,
              model as unknown as HasTable,
              input as AnyRow,
              ops
            )
          })
        ) as unknown as Deliver<Meta, Persisted<M, In>>
    )
    this.#db = db
    this.#model = model
    this.#input = input
    this.#ops = ops
  }

  #with(op: Op): Save<M, In, Meta> {
    return new Save(this.#db, this.#model, this.#input, [...this.#ops, op])
  }

  add<Def extends TableDefinition>(
    relation: ManyRelation<Def, any>,
    row: GraphRow<Def>
  ): Save<M, In, Meta> {
    return this.#with({
      kind: 'add',
      relation: relation as unknown as Relation,
      row: row as AnyRow
    })
  }
}

