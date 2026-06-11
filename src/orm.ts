// The rado ORM layer.
//
// Design notes:
// - A "model" is a plain spread of a table plus relation pointers:
//     const User = {...users, posts: many(posts)}
//   The spread keeps the table's symbol-keyed metadata, so a model is still a
//   fully working Table (select/join/where) and every column field passes
//   through: User.name is the same Field as users.name. Application code only
//   ever needs the model identifier; tables can stay module-private.
// - No registry: ORM helpers live on Database and are typed locally by the
//   model argument. Works with transactions for free since Transaction extends
//   Database.
// - Loading relations is unified with shaping: relation pointers appear
//   directly in select shapes and can be refined with
//   .select/.where/.orderBy/.limit. `select: {...User}` means "all columns +
//   all relations", `select: columns(User)` means columns only.
// - Writes are builder style: ops chain on save() and execute together in
//   one transaction when the Save is awaited (or .run() for sync drivers):
//     db.save(User, user).increment(User.loginCount).add(User.posts, post)
// - Everything preserves rado's sync/async dual nature: reads return regular
//   queries (await, or .all()/.get() for sync drivers) and writes expose
//   .run() plus the generator protocol used by txGenerator.
//
// The ORM class sits between Builder and Database so end users get db.find,
// db.first and db.save without importing a separate ORM namespace.

import {Builder} from './core/Builder.ts'
import type {Column} from './core/Column.ts'
import type {Transaction} from './core/Database.ts'
import {count as countRows} from './core/expr/Aggregate.ts'
import {and, eq, notInArray} from './core/expr/Conditions.ts'
import {Field, type FieldData} from './core/expr/Field.ts'
import {Include, type IncludeQuery} from './core/expr/Include.ts'
import {type Input, input} from './core/expr/Input.ts'
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
type RuntimeTable = Table<TableDefinition>

interface OrmDatabase<Meta extends QueryMeta> extends ORM<Meta> {
  transaction<T>(
    run: (tx: Transaction<Meta>) => T | Promise<T>,
    options?: unknown
  ): Deliver<Meta, T>
}

// ── Relations ──────────────────────────────────────────────────────────────

export type OnRemove = 'delete' | 'detach' | 'ignore'

export interface RelationConfig {
  /** Local fields of the FK. Inferred from references() when omitted. */
  fields?: Array<HasSql>
  /** Foreign fields the FK points at. Inferred when omitted. */
  references?: Array<HasSql>
}

export interface ManyConfig extends RelationConfig {
  /** Junction table for many-to-many. */
  through?: Table
  /**
   * What happens to related rows missing from a reconciling Save.set:
   * delete the row, detach it (null the FK / delete the junction row),
   * or ignore (default — arrays are merge-only).
   */
  onRemove?: OnRemove
}

/** Any value allowed inside a relation/select shape. */
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

  protected constructor(data: RelationData<Def, Card, Shaped>) {
    super(data)
    this[internalData] = data
  }
}

export abstract class OneRelation<
  Def extends TableDefinition = TableDefinition,
  Shaped = Table<Def>
> extends Relation<Def, 'one', Shaped> {
  protected constructor(target: Table, config?: RelationConfig)
  protected constructor(data: RelationData<Def, 'one', Shaped>)
  protected constructor(
    targetOrData: Table | RelationData<Def, 'one', Shaped>,
    config: RelationConfig = {}
  ) {
    if ('card' in targetOrData) {
      super(targetOrData)
      return
    }
    super({
      card: 'one',
      target: targetOrData,
      config,
      shape: undefined,
      select: undefined!,
      from: targetOrData
    })
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
    return new One({...getData(this), shape} as RelationData<Def, 'one', S>)
  }
}

class One<
  Def extends TableDefinition = TableDefinition,
  Shaped = Table<Def>
> extends OneRelation<
  Def,
  Shaped
> {
  constructor(data: RelationData<Def, 'one', Shaped>)
  constructor(target: Table, config?: RelationConfig)
  constructor(
    targetOrData: Table | RelationData<Def, 'one', Shaped>,
    config?: RelationConfig
  ) {
    if ('card' in targetOrData) super(targetOrData)
    else super(targetOrData, config)
  }
}

export abstract class ManyRelation<
  Def extends TableDefinition = TableDefinition,
  Shaped = Table<Def>
> extends Relation<Def, 'many', Shaped> {
  protected constructor(target: Table, config?: ManyConfig)
  protected constructor(data: RelationData<Def, 'many', Shaped>)
  protected constructor(
    targetOrData: Table | RelationData<Def, 'many', Shaped>,
    config: ManyConfig = {}
  ) {
    if ('card' in targetOrData) {
      super(targetOrData)
      return
    }
    super({
      card: 'many',
      target: targetOrData,
      config,
      shape: undefined,
      select: undefined!,
      from: targetOrData
    })
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
    return new Many({...getData(this), shape} as RelationData<Def, 'many', S>)
  }
}

class Many<
  Def extends TableDefinition = TableDefinition,
  Shaped = Table<Def>
> extends ManyRelation<
  Def,
  Shaped
> {
  constructor(data: RelationData<Def, 'many', Shaped>)
  constructor(target: Table, config?: ManyConfig)
  constructor(
    targetOrData: Table | RelationData<Def, 'many', Shaped>,
    config?: ManyConfig
  ) {
    if ('card' in targetOrData) super(targetOrData)
    else super(targetOrData, config)
  }
}

/** To-one relation. FK lives on the declaring table, inferred via references(). */
export function one<Def extends TableDefinition>(
  target: Table<Def>,
  config?: RelationConfig
): OneRelation<Def> {
  return new One(target as Table, config)
}

/** To-many relation. FK lives on the target (or on `through` for m2m). */
export function many<Def extends TableDefinition>(
  target: Table<Def>,
  config?: ManyConfig
): ManyRelation<Def> {
  return new Many(target as Table, config)
}

// ── Models ─────────────────────────────────────────────────────────────────

/** A model is a table spread carrying extra relation pointers. */
export type Model = object

type ModelInput<M extends Model> = M extends HasTable
  ? M
  : keyof DefinitionOfFields<M> extends never
    ? never
    : M

export type ModelDefinition<M> =
  M extends HasTable<infer Def, string> ? Def : DefinitionOfFields<M>

/** Row type of a definition, accounting for column nullability. */
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

/** Columns-only row of a model (no relations). */
export type ModelRow<M> = Expand<RowOf<ModelDefinition<M>>>

type RelationsOf<M> = {
  [K in keyof M as M[K] extends Relation<any, any, any>
    ? K
    : never]: M[K]
}

/** Columns-only shape of a model (relations and metadata excluded). */
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

/**
 * Columns-only select shape, so partial selects never need the underlying
 * table: select: {...columns(User), extra: sql`...`}
 */
export function columns<M extends Model>(model: M): ModelColumns<M> {
  return fromEntries(
    entries(model).filter(([, value]) => !isRelation(value))
  ) as ModelColumns<M>
}

// ── Internals: FK resolution ───────────────────────────────────────────────

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

function fieldKeyOf(api: TableApi, field: HasSql): string {
  if (!hasField(field)) throw new Error('Expected a column field')
  const data = getField(field)
  if (data.targetName !== api.aliased)
    throw new Error(
      `Field "${data.fieldName}" belongs to table "${data.targetName}", not "${api.aliased}"`
    )
  return keyByFieldName(api, data.fieldName)
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

interface ResolvedOne {
  parentKey: string | undefined
  parentField: Field
  targetKey: string
  targetField: Field
}

function resolveOne(
  parentApi: TableApi | undefined,
  rel: RelationLike,
  targetAlias?: string
): ResolvedOne {
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
    parentField: new Field(
      parentData.targetName,
      parentData.fieldName,
      parentData.source
    ),
    targetKey: keyByFieldName(targetApi, refData.fieldName),
    targetField: new Field(
      targetAlias ?? refData.targetName,
      refData.fieldName,
      refData.source
    )
  }
}

interface ResolvedMany {
  childKey: string
  childField: Field
  parentKey: string | undefined
  parentField: Field
}

function resolveMany(
  parentApi: TableApi | undefined,
  rel: RelationLike,
  targetAlias?: string
): ResolvedMany {
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
    childField: new Field(
      targetAlias ?? childData.targetName,
      childData.fieldName,
      childData.source
    ),
    parentKey: parentApi
      ? keyByFieldName(parentApi, refData.fieldName)
      : undefined,
    parentField: new Field(
      refData.targetName,
      refData.fieldName,
      refData.source
    )
  }
}

interface ResolvedThrough {
  jParentKey: string
  jParentField: Field
  parentKey: string | undefined
  parentField: Field
  jTargetKey: string
  jTargetField: Field
  targetKey: string
  targetField: Field
}

function resolveThrough(
  parentApi: TableApi | undefined,
  rel: RelationLike
): ResolvedThrough {
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
    jParentField: new Field(
      jApi.aliased,
      parentData.name ?? parent.key,
      parentData
    ),
    parentKey: parentApi
      ? keyByFieldName(parentApi, parent.ref.fieldName)
      : undefined,
    parentField: new Field(
      parent.ref.targetName,
      parent.ref.fieldName,
      parent.ref.source
    ),
    jTargetKey: target.key,
    jTargetField: new Field(
      jApi.aliased,
      targetData.name ?? target.key,
      targetData
    ),
    targetKey: keyByFieldName(targetApi, target.ref.fieldName),
    targetField: new Field(
      target.ref.targetName,
      target.ref.fieldName,
      target.ref.source
    )
  }
}

// ── Internals: shape compilation ───────────────────────────────────────────

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
    // Self relation: alias the inner table so the correlated condition can
    // reference the outer one. Shape fields pointing at the target are
    // remapped to the alias.
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

// ── Reading ────────────────────────────────────────────────────────────────

/**
 * Resolves a select shape to a row type. Relation pointers resolve to nested
 * rows of their (possibly refined) shape.
 */
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
  /** The model (or plain table) to query. */
  from: M
  select?: S
  where?: HasSql<boolean> | Array<HasSql<boolean>>
  orderBy?: HasSql | Array<HasSql>
  limit?: number
  offset?: number
}

export type ResultOf<M, S> = [S] extends [undefined] ? ModelRow<M> : ShapeRow<S>

function normalizeWhere(
  where: HasSql<boolean> | Array<HasSql<boolean>> | undefined
): HasSql<boolean> | undefined {
  if (!where) return undefined
  if (Array.isArray(where)) return where.length ? and(...where) : undefined
  return where
}

function tableApiOf(model: Model): TableApi {
  return getTable(model as HasTable)
}

function shapeOf(model: Model, select: Shape | undefined): SelectionInput {
  const api = tableApiOf(model)
  if (select) return compileShape(select, api)
  return tableFields(api.aliased, api.columns)
}

function tableOf(model: HasTable): RuntimeTable {
  return model as unknown as RuntimeTable
}

export abstract class ORM<Meta extends QueryMeta> extends Builder<Meta> {
  /** Fetch many rows. */
  find<M extends Model, S extends Shape | undefined = undefined>(
    options: FindOptions<ModelInput<M>, S>
  ): SingleQuery<Array<ResultOf<M, S>>, Meta> {
    return find(this, options as FindOptions<M, S>)
  }

  /** Fetch the first matching row. */
  first<M extends Model, S extends Shape | undefined = undefined>(
    options: FindOptions<ModelInput<M>, S>
  ): SingleQuery<ResultOf<M, S> | null, Meta> {
    return first(this, options as FindOptions<M, S>)
  }

  /** Count rows matching the filter. */
  count<M extends Model>(
    options: Pick<FindOptions<ModelInput<M>, undefined>, 'from' | 'where'>
  ): SingleQuery<number, Meta> {
    return count(
      this,
      options as Pick<FindOptions<M, undefined>, 'from' | 'where'>
    )
  }

  /** Save a graph of rows in one transaction. */
  save<M extends Model, In extends Graph<M>>(
    model: ModelInput<M>,
    input: In
  ): Save<M, In, Meta> {
    return save(this as unknown as OrmDatabase<Meta>, model as M, input)
  }

  /** Save several graphs in one transaction. */
  saveMany<M extends Model, In extends Graph<M>>(
    model: ModelInput<M>,
    inputs: Array<In>
  ): Operation<Array<Persisted<M, In>>, Meta> {
    return saveMany(this as unknown as OrmDatabase<Meta>, model as M, inputs)
  }

  /** Delete by entity or primary key. */
  destroy<M extends Model>(
    model: ModelInput<M>,
    entity: Input<number | string> | Partial<ModelRow<M>>
  ): SingleQuery<unknown, Meta> {
    return destroy(this, model as M, entity)
  }
}

/** Fetch many rows. drizzle: db.query.x.findMany */
function find<
  M extends Model,
  S extends Shape | undefined = undefined,
  Meta extends QueryMeta = QueryMeta
>(
  db: ORM<Meta>,
  options: FindOptions<M, S>
): SingleQuery<Array<ResultOf<M, S>>, Meta> {
  const {orderBy} = options
  const query: SelectionQuery = {
    select: shapeOf(options.from, options.select),
    from: tableOf(options.from as HasTable),
    where: normalizeWhere(options.where),
    orderBy: orderBy && (Array.isArray(orderBy) ? orderBy : [orderBy]),
    limit: options.limit,
    offset: options.offset
  }
  return db.$query(query) as unknown as SingleQuery<Array<ResultOf<M, S>>, Meta>
}

/** find with limit 1. drizzle: findFirst */
function first<
  M extends Model,
  S extends Shape | undefined = undefined,
  Meta extends QueryMeta = QueryMeta
>(
  db: ORM<Meta>,
  options: FindOptions<M, S>
): SingleQuery<ResultOf<M, S> | null, Meta> {
  const {orderBy} = options
  const query: FirstSelectionQuery = {
    select: shapeOf(options.from, options.select),
    from: tableOf(options.from as HasTable),
    where: normalizeWhere(options.where),
    orderBy: orderBy && (Array.isArray(orderBy) ? orderBy : [orderBy]),
    limit: 1,
    offset: options.offset,
    first: true
  }
  return db.$query(query) as unknown as SingleQuery<ResultOf<M, S> | null, Meta>
}

/** Count rows matching the filter. Pairs with find for pagination. */
function count<M extends Model, Meta extends QueryMeta = QueryMeta>(
  db: ORM<Meta>,
  options: Pick<FindOptions<M, undefined>, 'from' | 'where'>
): SingleQuery<number, Meta> {
  const query: FirstSelectionQuery = {
    select: countRows(),
    from: tableOf(options.from as HasTable),
    where: normalizeWhere(options.where),
    first: true
  }
  return db.$query(query) as unknown as SingleQuery<number, Meta>
}

// ── Writing ────────────────────────────────────────────────────────────────

/**
 * A row in a save graph: either a new row (no pk → INSERT) or an existing
 * row (pk present → UPDATE of the given fields).
 */
export type GraphRow<Def extends TableDefinition> =
  | TableInsert<Def>
  | TableUpdate<Def>

/** Insert/update graph for a model: columns + nested relation rows. */
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

/** save() resolves with clean persisted rows for everything it touched. */
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
  | {kind: 'set'; values: AnyRow}
  | {
      kind: 'setRelation'
      relation: Relation
      value: Array<AnyRow> | AnyRow | null
    }
  | {kind: 'unset'; field: HasSql}
  | {kind: 'increment'; field: HasSql; by: number}
  | {kind: 'add'; relation: Relation; row: AnyRow}
  | {kind: 'remove'; relation: Relation; row: AnyRow}

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
  const api = tableApiOf(model)
  const pkKey = primaryKeyOf(api)
  const rels = modelRelations(model)
  const isUpdate = inputRow[pkKey] !== undefined && inputRow[pkKey] !== null
  const result: AnyRow = {}

  const values: AnyRow = {}
  for (const key of keys(api.columns))
    if (inputRow[key] !== undefined) values[key] = inputRow[key]

  // To-one relations are saved first: the FK lives on this row
  for (const [key, rel] of rels) {
    const relData = getData(rel)
    if (relData.card !== 'one') continue
    const op = ops.find(
      op => op.kind === 'setRelation' && op.relation === rel
    ) as Extract<Op, {kind: 'setRelation'}> | undefined
    const fromInput = key in inputRow && inputRow[key] !== undefined
    if (!fromInput && !op) continue
    const child = op
      ? (op.value as AnyRow | null)
      : (inputRow[key] as AnyRow | null)
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

  // Scalar ops
  for (const op of ops) {
    if (op.kind === 'set') assign(values, op.values)
    else if (op.kind === 'unset') values[fieldKeyOf(api, op.field)] = null
    else if (op.kind === 'increment') {
      if (!isUpdate)
        throw new Error('increment() requires a row with a primary key')
      values[fieldKeyOf(api, op.field)] = sql`${op.field} + ${input(op.by)}`
    }
  }

  // Write this row
  const returning = tableFields(api.aliased, api.columns)
  const pkField = fieldOf(api, pkKey)
  const table = tableOf(model)
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

  // To-many relations: FK lives on the target (or junction rows for m2m)
  for (const [key, rel] of rels) {
    const relData = getData(rel)
    if (relData.card !== 'many') continue
    const fromInput = key in inputRow && Array.isArray(inputRow[key])
    const relOps = ops.filter(
      op => 'relation' in op && op.relation === rel
    ) as Array<Extract<Op, {relation: Relation}>>
    if (!fromInput && relOps.length === 0) continue
    const reconcile = relOps.find(op => op.kind === 'setRelation') as
      | Extract<Op, {kind: 'setRelation'}>
      | undefined
    const inputRows = fromInput ? (inputRow[key] as Array<AnyRow>) : []
    const reconciledRows = Array.isArray(reconcile?.value)
      ? reconcile.value
      : []
    const toSave: Array<AnyRow> = [
      ...inputRows,
      ...relOps.flatMap(op => (op.kind === 'add' ? [op.row] : [])),
      ...reconciledRows
    ]
    const saved: Array<AnyRow> = []
    for (const childRow of toSave)
      saved.push(yield* saveRelated(tx, api, rel, row, childRow))
    for (const op of relOps)
      if (op.kind === 'remove') yield* removeRelated(tx, api, rel, row, op.row)
    if (reconcile) yield* detachOthers(tx, api, rel, row, saved)
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
        insert: tableOf(junction),
        values: {
          [link.jParentKey]: parentValue,
          [link.jTargetKey]: targetValue
        } as TableInsert<TableDefinition>
      } as InsertQuery)
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

function* removeRelated<Meta extends QueryMeta>(
  tx: ORM<Meta>,
  parentApi: TableApi,
  rel: Relation,
  parentRow: AnyRow,
  childRow: AnyRow
): TxGenerator<Meta, void> {
  const relData = getData(rel)
  const action = relData.config.onRemove ?? 'detach'
  if (action === 'ignore') return
  if (relData.config.through) {
    const link = resolveThrough(parentApi, rel)
    const targetValue = childRow[link.targetKey]
    if (targetValue === undefined)
      throw new Error('remove() requires the related row to carry its key')
    const query: DeleteQuery = {
      delete: tableOf(relData.config.through),
      where: and(
        eq(link.jParentField, parentRow[link.parentKey!]),
        eq(link.jTargetField, targetValue)
      )
    }
    yield* tx.$query(query)
    return
  }
  const targetApi = getTable(relData.target)
  const pkKey = primaryKeyOf(targetApi)
  const pk = childRow[pkKey]
  if (pk === undefined)
    throw new Error(
      'remove() requires the related row to carry its primary key'
    )
  const pkField = fieldOf(targetApi, pkKey)
  if (action === 'delete') {
    const query: DeleteQuery = {
      delete: tableOf(relData.target),
      where: eq(pkField, pk)
    }
    yield* tx.$query(query)
  } else {
    const link = resolveMany(parentApi, rel)
    const query: UpdateQuery = {
      update: tableOf(relData.target),
      set: {[link.childKey]: null} as TableUpdate<TableDefinition>,
      where: eq(pkField, pk)
    }
    yield* tx.$query(query)
  }
}

function* detachOthers<Meta extends QueryMeta>(
  tx: ORM<Meta>,
  parentApi: TableApi,
  rel: Relation,
  parentRow: AnyRow,
  kept: Array<AnyRow>
): TxGenerator<Meta, void> {
  const relData = getData(rel)
  const action = relData.config.onRemove ?? 'ignore'
  if (action === 'ignore') return
  if (relData.config.through) {
    const link = resolveThrough(parentApi, rel)
    const keep = kept.map(row => row[link.targetKey])
    const base = eq(link.jParentField, parentRow[link.parentKey!])
    const query: DeleteQuery = {
      delete: tableOf(relData.config.through),
      where: keep.length ? and(base, notInArray(link.jTargetField, keep)) : base
    }
    yield* tx.$query(query)
    return
  }
  const targetApi = getTable(relData.target)
  const pkKey = primaryKeyOf(targetApi)
  const link = resolveMany(parentApi, rel)
  const keep = kept.map(row => row[pkKey])
  const base = eq(link.childField, parentRow[link.parentKey!])
  const where = keep.length
    ? and(base, notInArray(fieldOf(targetApi, pkKey), keep))
    : base
  if (action === 'delete') {
    const query: DeleteQuery = {delete: tableOf(relData.target), where}
    yield* tx.$query(query)
  } else {
    const query: UpdateQuery = {
      update: tableOf(relData.target),
      set: {[link.childKey]: null} as TableUpdate<TableDefinition>,
      where
    }
    yield* tx.$query(query)
  }
}

function execSave<Meta extends QueryMeta>(
  db: OrmDatabase<Meta>,
  model: HasTable,
  input: AnyRow,
  ops: Array<Op>
) {
  return db.transaction(
    txGenerator(function* (tx) {
      return yield* saveGraph(tx, model, input, ops)
    })
  )
}

/**
 * Smart save, builder style:
 * - pk absent → INSERT, pk present → UPDATE (only fields that were set)
 * - pk present but no matching row → the transaction fails with an error;
 *   save never silently inserts a row with an explicit pk. Deliberate
 *   upserts go through the query builder (onConflictDoUpdate), as in drizzle
 * - relation rows are saved recursively; FKs are wired automatically
 * - ops (set/unset/increment/add/remove) chain on the builder and execute
 *   with the graph, ordered by FK dependency, in a single transaction
 * - m2m saves insert junction rows; onRemove governs reconciliation
 * - resolves with clean persisted rows: ids and defaults filled in; the
 *   input object is untouched
 */
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
        execSave(
          db,
          model as unknown as HasTable,
          input as AnyRow,
          ops
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

  /** Overwrite scalar fields. */
  set(values: TableUpdate<ModelDefinition<M>>): Save<M, In, Meta>
  /** Reconcile a to-many relation to exactly these rows (honors onRemove). */
  set<Def extends TableDefinition>(
    relation: ManyRelation<Def, any>,
    rows: Array<GraphRow<Def>>
  ): Save<M, In, Meta>
  /** Set or detach (null) a to-one relation. */
  set<Def extends TableDefinition>(
    relation: OneRelation<Def, any>,
    row: GraphRow<Def> | null
  ): Save<M, In, Meta>
  set(
    target: TableUpdate<ModelDefinition<M>> | Relation,
    value?: unknown
  ): Save<M, In, Meta> {
    if (isRelation(target))
      return this.#with({
        kind: 'setRelation',
        relation: target as Relation,
        value: value as Array<AnyRow> | AnyRow | null
      })
    return this.#with({kind: 'set', values: target as AnyRow})
  }

  /** Clear a field (set to null). Field pointer, not a string. */
  unset(field: HasSql): Save<M, In, Meta> {
    return this.#with({kind: 'unset', field})
  }

  /** Atomic increment: SET n = n + by, no read required. */
  increment(
    field: HasSql<number> | HasSql<number | null>,
    by = 1
  ): Save<M, In, Meta> {
    return this.#with({kind: 'increment', field, by})
  }

  /** Add a row to a to-many relation (insert or reparent/update). */
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

  /** Remove a row from a to-many relation (honors onRemove). */
  remove<Def extends TableDefinition>(
    relation: ManyRelation<Def, any>,
    row: GraphRow<Def>
  ): Save<M, In, Meta> {
    return this.#with({
      kind: 'remove',
      relation: relation as unknown as Relation,
      row: row as AnyRow
    })
  }
}

/** Save a graph of rows in one transaction. */
function save<
  M extends Model,
  In extends Graph<M>,
  Meta extends QueryMeta = QueryMeta
>(db: OrmDatabase<Meta>, model: M, input: In): Save<M, In, Meta> {
  return new Save(db, model, input)
}

/** Save several graphs in one transaction (seeding, imports). */
function saveMany<
  M extends Model,
  In extends Graph<M>,
  Meta extends QueryMeta = QueryMeta
>(
  db: OrmDatabase<Meta>,
  model: M,
  inputs: Array<In>
): Operation<Array<Persisted<M, In>>, Meta> {
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

/**
 * Delete by entity or primary key.
 *
 * Deletion does not cascade at the ORM level: like drizzle, related rows are
 * governed by the referential actions declared on the schema via
 * references(…, {onDelete}). Relation onRemove only applies to reconciliation
 * during save(); it plays no role here.
 */
function destroy<M extends Model, Meta extends QueryMeta = QueryMeta>(
  db: ORM<Meta>,
  model: M,
  entity: Input<number | string> | Partial<ModelRow<M>>
): SingleQuery<unknown, Meta> {
  const api = tableApiOf(model)
  const pkKey = primaryKeyOf(api)
  const pk =
    entity !== null && typeof entity === 'object' && !hasSql(entity)
      ? (entity as AnyRow)[pkKey]
      : entity
  if (pk === undefined || pk === null)
    throw new Error('destroy() requires a primary key value')
  const query: DeleteQuery = {
    delete: tableOf(model as unknown as HasTable),
    where: eq(fieldOf(api, pkKey), pk as Input<number | string>)
  }
  return db.$query(query) as SingleQuery<unknown, Meta>
}

// ── Open questions ─────────────────────────────────────────────────────────
// - pk visibility: GraphRow = TableInsert | TableUpdate lets a typo'd insert
//   typecheck as an "update". get()'s id is also untyped against the actual
//   pk column and composite pks are not representable. All fixable by
//   branding primaryKey() in Column's type parameters (core change).
// - unset/increment accept any HasSql; should be narrowed to fields of the
//   model's own columns.
// - relation refinements (.where/.orderBy) on self relations are not
//   remapped to the inner alias; only shape fields are.
