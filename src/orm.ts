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
  hasRelation,
  hasSql,
  hasTable,
  internalBindRelation,
  internalData,
  internalRelation,
  internalSql
} from './core/Internal.ts'
import type {Deliver, QueryMeta} from './core/MetaData.ts'
import {Operation, type SingleQuery} from './core/Queries.ts'
import type {
  DeleteQuery,
  FromGuard,
  InsertQuery,
  SelectionQuery,
  UpdateQuery
} from './core/query/Query.ts'
import {Select, selectQuery} from './core/query/Select.ts'
import type {SelectionInput} from './core/Selection.ts'
import {Sql, sql} from './core/Sql.ts'
import {
  type Table,
  type TableApi,
  type TableDefinition,
  type TableFields,
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

export interface RelationConfig<From extends HasSql = HasSql> {
  from: From
  to: HasSql
  alias?: string
}
export interface ThroughConfig {
  table: Table
  from: HasSql
  to: HasSql
}
export interface ManyRelationConfig<
  From extends HasSql = HasSql
> extends RelationConfig<From> {
  through?: ThroughConfig
}
export type RelationConfigInput<From extends HasSql = HasSql> =
  | ManyRelationConfig<From>
  | ((self: Record<string, HasSql>) => ManyRelationConfig<From>)

type RelationTarget<Def extends TableDefinition> =
  | HasTable<Def>
  | (() => HasTable<Def>)
type RelationScope<
  Def extends TableDefinition,
  Card extends 'one' | 'many',
  From extends HasSql,
  Shaped
> = (
  from: Record<string, HasSql>,
  to: RelationQuery<Def, Card, From, Shaped> & TableFields<Def>
) => RelationQuery<any, any, any, any>

export type Shape =
  | HasSql
  | Table
  | RelationQuery<any, any, any, any>
  | RelationFn<any, any, any, any>
  | Record<string, any>

interface RelationData<
  Def extends TableDefinition = TableDefinition,
  Card extends 'one' | 'many' = 'one' | 'many',
  From extends HasSql = HasSql,
  Shaped = Table<Def>
> extends SelectionQuery {
  card: Card
  target: RelationTarget<Def>
  config: RelationConfigInput<From>
  shape: Shaped | undefined
  scope?: RelationScope<Def, Card, From, Shaped>
}

type RelationLike = {
  readonly [internalData]: RelationData<any, any, any, any>
}

export class RelationQuery<
  Def extends TableDefinition = TableDefinition,
  Card extends 'one' | 'many' = 'one' | 'many',
  From extends HasSql = HasSql,
  Shaped = Table<Def>
> extends Select<SelectionInput> {
  readonly [internalRelation] = true
  readonly [internalData]: RelationData<Def, Card, From, Shaped>

  constructor(data: RelationData<Def, Card, From, Shaped>) {
    const target = targetOf(data.target)
    const next = {...data, from: data.from ?? target}
    super(next)
    this[internalData] = next as RelationData<Def, Card, From, Shaped>
  }

  #wrap(query: Select<SelectionInput>): RelationQuery<Def, Card, From, Shaped> {
    return new RelationQuery(
      getData(query) as RelationData<Def, Card, From, Shaped>
    )
  }

  select<S>(shape: S): RelationQuery<Def, Card, From, S> {
    return new RelationQuery({
      ...getData(this),
      shape
    } as RelationData<Def, Card, From, S>)
  }

  where(
    ...where: Array<HasSql<boolean> | undefined>
  ): RelationQuery<Def, Card, From, Shaped> {
    return this.#wrap(super.where(...where))
  }

  orderBy(...orderBy: Array<HasSql>): RelationQuery<Def, Card, From, Shaped> {
    return this.#wrap(super.orderBy(...orderBy))
  }

  limit(limit: Input<number>): RelationQuery<Def, Card, From, Shaped> {
    return this.#wrap(super.limit(limit))
  }

  offset(offset: Input<number>): RelationQuery<Def, Card, From, Shaped> {
    return this.#wrap(super.offset(offset))
  }

  innerJoin(
    right: HasTable | Sql,
    on: HasSql<boolean>
  ): RelationQuery<Def, Card, From, Shaped> {
    return this.#wrap(super.innerJoin(right, on))
  }

  leftJoin(
    right: HasTable | Sql,
    on: HasSql<boolean>
  ): RelationQuery<Def, Card, From, Shaped> {
    return this.#wrap(super.leftJoin(right, on))
  }
}

export type RelationFn<
  Def extends TableDefinition = TableDefinition,
  Card extends 'one' | 'many' = 'one' | 'many',
  From extends HasSql = HasSql,
  Shaped = Table<Def>
> = {
  (): RelationQuery<Def, Card, From, Shaped>
  <S>(
    scope: (
      from: Record<string, HasSql>,
      to: RelationQuery<Def, Card, From, Shaped> & TableFields<Def>
    ) => RelationQuery<Def, Card, From, S>
  ): RelationQuery<Def, Card, From, S>
} & {
  readonly [internalData]: RelationData<Def, Card, From, Shaped>
  readonly [internalRelation]: true
  [internalBindRelation]?(self: object): RelationFn<Def, Card, From, Shaped>
  select<S>(shape: S): RelationQuery<Def, Card, From, S>
  where(
    ...where: Array<HasSql<boolean> | undefined>
  ): RelationFn<Def, Card, From, Shaped>
  orderBy(...orderBy: Array<HasSql>): RelationFn<Def, Card, From, Shaped>
  limit(limit: Input<number>): RelationFn<Def, Card, From, Shaped>
  offset(offset: Input<number>): RelationFn<Def, Card, From, Shaped>
  innerJoin(
    right: HasTable | Sql,
    on: HasSql<boolean>
  ): RelationFn<Def, Card, From, Shaped>
  leftJoin(
    right: HasTable | Sql,
    on: HasSql<boolean>
  ): RelationFn<Def, Card, From, Shaped>
}

export type OneRelation<
  Def extends TableDefinition = TableDefinition,
  From extends HasSql = HasSql,
  Shaped = Table<Def>
> = RelationFn<Def, 'one', From, Shaped>

export type ManyRelation<
  Def extends TableDefinition = TableDefinition,
  From extends HasSql = HasSql,
  Shaped = Table<Def>
> = RelationFn<Def, 'many', From, Shaped> & {
  count(): HasSql<number>
  some(...conditions: Array<HasSql<boolean>>): HasSql<boolean>
  none(...conditions: Array<HasSql<boolean>>): HasSql<boolean>
}

function define<T, K extends PropertyKey, V>(
  target: T,
  key: K,
  value: V
): T & Record<K, V> {
  Object.defineProperty(target, key, {configurable: true, value})
  return target as T & Record<K, V>
}

function targetOf<Def extends TableDefinition>(
  target: RelationTarget<Def>
): HasTable<Def> {
  if (typeof target === 'function' && !hasTable(target))
    return (target as () => HasTable<Def>)()
  return target as HasTable<Def>
}

function isRelation(value: unknown): value is RelationLike {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    hasRelation(value)
  )
}

function relationData<
  Def extends TableDefinition,
  Card extends 'one' | 'many',
  From extends HasSql
>(
  card: Card,
  target: RelationTarget<Def>,
  config: RelationConfigInput<From>
): RelationData<Def, Card, From> {
  return {card, target, config, shape: undefined, select: undefined!}
}

function relationFromData<
  Def extends TableDefinition,
  Card extends 'one' | 'many',
  From extends HasSql,
  Shaped
>(
  data: RelationData<Def, Card, From, Shaped>
): RelationFn<Def, Card, From, Shaped> {
  const rel = (<S>(
    scope?: (
      from: Record<string, HasSql>,
      to: RelationQuery<Def, Card, From, Shaped> & TableFields<Def>
    ) => RelationQuery<Def, Card, From, S>
  ) => {
    const data = getData(rel)
    if (!scope) return new RelationQuery(data)
    return new RelationQuery({
      ...data,
      scope: scope as RelationScope<Def, Card, From, Shaped>
    } as RelationData<Def, Card, From, S>)
  }) as RelationFn<Def, Card, From, Shaped>
  define(rel, internalRelation, true)
  define(rel, internalData, data)
  define(rel, internalBindRelation, (self: object) =>
    typeof getData(rel).config === 'function'
      ? (() => {
          const current = getData(rel)
          const config = current.config as (
            self: Record<string, HasSql>
          ) => RelationConfig<From>
          return relationFromData({
            ...current,
            config: config(self as Record<string, HasSql>)
          })
        })()
      : rel
  )
  define(rel, 'select', <S extends Shape>(shape: S) => rel().select(shape))
  define(rel, 'where', (...where: Array<HasSql<boolean> | undefined>) =>
    relationFromData(getData(rel().where(...where)))
  )
  define(rel, 'orderBy', (...orderBy: Array<HasSql>) =>
    relationFromData(getData(rel().orderBy(...orderBy)))
  )
  define(rel, 'limit', (limit: Input<number>) =>
    relationFromData(getData(rel().limit(limit)))
  )
  define(rel, 'offset', (offset: Input<number>) =>
    relationFromData(getData(rel().offset(offset)))
  )
  define(rel, 'innerJoin', (right: HasTable | Sql, on: HasSql<boolean>) =>
    relationFromData(getData(rel().innerJoin(right, on)))
  )
  define(rel, 'leftJoin', (right: HasTable | Sql, on: HasSql<boolean>) =>
    relationFromData(getData(rel().leftJoin(right, on)))
  )
  return rel
}

function selfFields(api: TableApi): Record<string, HasSql> {
  return tableFields(api.aliased, api.columns)
}

function outerFields(api: TableApi): Record<string, HasSql> {
  return fromEntries(
    entries(selfFields(api)).map(([key, field]) => [key, outerField(field)])
  ) as Record<string, HasSql>
}

function emptySelf(): Record<string, HasSql> {
  return new Proxy(
    {},
    {
      get() {
        return sql`null`
      }
    }
  ) as Record<string, HasSql>
}

function relationConfig(
  data: RelationData,
  parentApi?: TableApi
): ManyRelationConfig {
  return typeof data.config === 'function'
    ? data.config(parentApi ? selfFields(parentApi) : emptySelf())
    : data.config
}

function outerField(field: HasSql): HasSql {
  if (!hasField(field)) return field
  const data = getField(field)
  return new Field(Sql.SELF_TARGET, data.fieldName, data.source)
}

function aliasField(field: HasSql, fromName: string, toName: string): HasSql {
  if (!hasField(field)) return field
  const data = getField(field)
  if (data.targetName !== fromName) return field
  return new Field(toName, data.fieldName, data.source)
}

function selfNameOf(field: HasSql): string | undefined {
  return hasField(field) ? getField(field).targetName : undefined
}

function relationFrom(
  data: RelationData,
  config: ManyRelationConfig,
  target: HasTable,
  aliasName: string | undefined
): FromGuard {
  if (config.through) {
    const targetApi = getTable(target)
    const targetForJoin = aliasName ? alias(target as Table, aliasName) : target
    const to = aliasName
      ? aliasField(config.to, targetApi.aliased, aliasName)
      : config.to
    return [
      config.through.table,
      {innerJoin: targetForJoin, on: eq(config.through.to, to)}
    ]
  }
  if (!aliasName) return data.from ?? target
  return alias(target as Table, aliasName)
}

function relationQuery(
  data: RelationData<any, any, any, any>,
  parentApi?: TableApi
): SelectionQuery {
  const target = targetOf(data.target)
  const config = relationConfig(data, parentApi)
  const targetApi = getTable(target)
  const name = config.alias
  const api = name ? getTable(alias(target as Table, name)) : targetApi
  const query = {
    ...data,
    select: data.shape
      ? compileShape(data.shape as Shape, api)
      : tableFields(api.aliased, api.columns),
    from: relationFrom(data, config, target, name),
    where: combine(
      eq(
        config.through ? config.through.from : config.to,
        outerField(config.from)
      ),
      data.where
    )
  }
  return query
}

function relationSql(
  data: RelationData<any, any, any, any>,
  query: SelectionQuery
): Sql {
  const config = relationConfig(data)
  const selfName = selfNameOf(config.from)
  if (!config.alias)
    return selectQuery(query).nameSelf(selfName ?? Sql.SELF_TARGET)
  const targetApi = getTable(targetOf(data.target))
  return selectQuery(query).nameSelf(config.alias, targetApi.aliased, selfName)
}

function relationExpr(
  rel: RelationLike,
  parentApi: TableApi
): Include<unknown> {
  const data = getData(rel)
  const target = targetOf(data.target)
  const targetApi = getTable(target)
  const config = relationConfig(data, parentApi)
  let aliasName: string | undefined
  let from: FromGuard = relationFrom(data, config, target, undefined)
  let shape = data.shape
  let innerApi = targetApi
  if (config.alias || targetApi.aliased === parentApi.aliased) {
    aliasName = config.alias ?? `${targetApi.aliased}_${data.card}`
    innerApi = getTable(alias(target as Table, aliasName))
    from = relationFrom(data, config, target, aliasName)
  }
  const scoped = data.scope?.(
    outerFields(parentApi),
    assign(
      new RelationQuery({...data, from}),
      tableFields(innerApi.aliased, innerApi.columns)
    ) as RelationQuery<any, any, any, any> & TableFields<any>
  )
  const scopedData = scoped && getData(scoped)
  if (scopedData) {
    from = scopedData.from ?? from
    shape = scopedData.shape
  }
  const localData = scopedData ?? data
  const query: IncludeQuery = {
    ...data,
    ...localData,
    select: shape
      ? compileShape(shape as Shape, innerApi)
      : tableFields(innerApi.aliased, innerApi.columns),
    from,
    where: combine(
      eq(
        config.through ? config.through.from : config.to,
        outerField(config.from)
      ),
      localData.where
    ),
    first: data.card === 'one',
    self: aliasName
      ? {
          name: aliasName,
          sourceName: targetApi.aliased,
          selfName: parentApi.aliased
        }
      : {name: parentApi.aliased}
  }
  return new Include(query)
}

export function one<Def extends TableDefinition, From extends HasSql>(
  target: RelationTarget<Def>,
  config: RelationConfigInput<From>
): OneRelation<Def, From> {
  return relationFromData(relationData('one', target, config)) as OneRelation<
    Def,
    From
  >
}

export function many<Def extends TableDefinition, From extends HasSql>(
  target: RelationTarget<Def>,
  config: RelationConfigInput<From>
): ManyRelation<Def, From> {
  const rel = relationFromData(
    relationData('many', target, config)
  ) as ManyRelation<Def, From>
  define(rel, 'count', () =>
    lazy(
      () =>
        sql<number>`(${relationSql(getData(rel), {
          ...relationQuery(getData(rel)),
          select: countRows()
        })})`
    )
  )
  define(rel, 'some', (...conditions: Array<HasSql<boolean>>) =>
    lazy(() => {
      const query = relationQuery(getData(rel))
      return sql<boolean>`exists (${relationSql(getData(rel), {
        ...query,
        select: sql`1`,
        where: combine(query.where, and(...conditions))
      })})`
    })
  )
  define(rel, 'none', (...conditions: Array<HasSql<boolean>>) =>
    lazy(() => {
      const query = relationQuery(getData(rel))
      return sql<boolean>`not exists (${relationSql(getData(rel), {
        ...query,
        select: sql`1`,
        where: combine(query.where, and(...conditions))
      })})`
    })
  )
  define(rel, internalBindRelation, (self: object) =>
    typeof getData(rel).config === 'function'
      ? (() => {
          const current = getData(rel)
          const config = current.config as (
            self: Record<string, HasSql>
          ) => RelationConfig<From>
          return many(current.target, config(self as Record<string, HasSql>))
        })()
      : rel
  )
  return rel
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
  [K in keyof M as M[K] extends RelationFn<any, any, any, any>
    ? K
    : never]: M[K]
}

export type ModelColumns<M> = {
  [K in keyof M as M[K] extends RelationFn<any, any, any, any>
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
  base: HasSql<boolean> | undefined,
  condition: HasSql<boolean> | undefined
): HasSql<boolean> | undefined {
  if (!base) return condition
  return condition ? and(base, condition) : base
}

function fieldDataOf(field: HasSql): FieldData {
  if (!hasField(field)) throw new Error('Expected a column field')
  return getField(field)
}

function fieldKey(api: TableApi, field: HasSql): string {
  const data = fieldDataOf(field)
  for (const [key, column] of entries(api.columns))
    if ((getData(column).name ?? key) === data.fieldName) return key
  throw new Error(`No column "${data.fieldName}" on table "${api.aliased}"`)
}

function assertDirectRelation(data: RelationData): void {
  if (
    data.shape ||
    data.scope ||
    data.from ||
    data.where ||
    data.orderBy ||
    data.groupBy ||
    data.having ||
    data.distinct ||
    data.distinctOn ||
    data.limit !== undefined ||
    data.offset !== undefined
  )
    throw new Error('db.load() only accepts a direct relation')
}

function compileShape(shape: Shape, parentApi: TableApi): SelectionInput {
  if (isRelation(shape)) return relationExpr(shape, parentApi) as SelectionInput
  if (hasSql(shape as object)) return shape as SelectionInput
  if (shape && typeof shape === 'object')
    return fromEntries(
      entries(shape)
        .filter(
          ([, value]) => !(typeof value === 'function' && isRelation(value))
        )
        .map(([key, value]) => [key, compileShape(value as Shape, parentApi)])
    ) as SelectionInput
  throw new Error('Invalid select shape')
}

export type ShapeRow<In> =
  In extends RelationFn<any, any, any, any>
    ? never
    : In extends RelationQuery<any, 'many', any, infer S>
      ? Array<ShapeRow<S>>
      : In extends RelationQuery<any, 'one', any, infer S>
        ? ShapeRow<S> | null
        : In extends HasSql<infer Value>
          ? Value
          : In extends object
            ? Expand<{
                [K in keyof In as In[K] extends RelationFn<any, any, any, any>
                  ? never
                  : K extends string
                    ? K
                    : never]: ShapeRow<In[K]>
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
type ValueOf<From> = From extends HasSql<infer Value> ? Input<Value> : never

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

  load<Def extends TableDefinition, From extends HasSql>(
    relation: RelationFn<Def, 'many', From, Table<Def>>,
    value: ValueOf<From>
  ): SingleQuery<Array<ShapeRow<Table<Def>>>, Meta>
  load<Def extends TableDefinition, From extends HasSql>(
    relation: RelationFn<Def, 'one', From, Table<Def>>,
    value: ValueOf<From>
  ): SingleQuery<ShapeRow<Table<Def>> | null, Meta>
  load(
    relation: RelationFn,
    value: Input<unknown>
  ): SingleQuery<unknown, Meta> {
    const data = getData(relation)
    assertDirectRelation(data)
    const config = relationConfig(data)
    const targetApi = getTable(targetOf(data.target))
    const loadKey = config.through
      ? config.through.from
      : config.alias
        ? aliasField(config.to, targetApi.aliased, config.alias)
        : config.to
    const query = {
      ...relationQuery(data),
      where: eq(loadKey, value),
      first: data.card === 'one'
    }
    return this.$query(query as SelectionQuery) as unknown as SingleQuery<
      unknown,
      Meta
    >
  }

  count<M extends Model>(
    options: Pick<FindOptions<ModelInput<M>, undefined>, 'from' | 'where'>
  ): SingleQuery<number, Meta> {
    const {where} = options
    return this.$query({
      select: countRows(),
      from: options.from as unknown as Table<TableDefinition>,
      where: Array.isArray(where) ? and(...where) : where,
      first: true
    } as FirstSelectionQuery) as SingleQuery<number, Meta>
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
                  row as AnyRow
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
  readonly [K in keyof RelationsOf<M>]?: RelationsOf<M>[K] extends RelationFn<
    infer Def,
    'many',
    any,
    any
  >
    ? Array<GraphRow<Def>>
    : RelationsOf<M>[K] extends RelationFn<infer Def, 'one', any, any>
      ? GraphRow<Def> | null
      : never
}

export type Persisted<M, In> = Expand<
  ModelRow<M> & {
    [K in Extract<
      keyof In,
      keyof RelationsOf<M>
    >]: RelationsOf<M>[K] extends RelationFn<infer Def, 'many', any, any>
      ? Array<Expand<RowOf<Def>>>
      : RelationsOf<M>[K] extends RelationFn<infer Def, 'one', any, any>
        ? Expand<RowOf<Def>> | null
        : never
  }
>

function modelRelations(model: object): Array<[string, RelationFn]> {
  return entries(model).filter(
    (entry): entry is [string, RelationFn] =>
      typeof entry[1] === 'function' && isRelation(entry[1])
  )
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

function fieldOf(api: TableApi, key: string): Field {
  const data = getData(api.columns[key])
  return new Field(api.aliased, data.name ?? key, data)
}

function* saveGraph<Meta extends QueryMeta>(
  tx: ORM<Meta>,
  model: HasTable,
  inputRow: AnyRow
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
    const config = relationConfig(relData, api)
    const parentKey = fieldKey(api, config.from)
    const targetApi = getTable(targetOf(relData.target))
    const targetKey = fieldKey(targetApi, config.to)
    if (child === null) {
      values[parentKey] = null
      result[key] = null
    } else {
      const saved = yield* saveGraph(tx, targetOf(relData.target), child)
      values[parentKey] = saved[targetKey]
      result[key] = saved
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
      const rows = (yield* tx.$query({
        update: table,
        set: set as TableUpdate<TableDefinition>,
        where: eq(pkField, pk),
        returning
      } as UpdateQuery<typeof returning>)) as unknown as Array<AnyRow>
      row = rows[0]
    } else {
      row = (yield* tx.$query({
        select: returning,
        from: table,
        where: eq(pkField, pk),
        first: true
      } as FirstSelectionQuery<typeof returning>)) as unknown as AnyRow
    }
    if (!row)
      throw new Error(`No row in "${api.aliased}" with primary key ${pk}`)
  } else {
    const rows = (yield* tx.$query({
      insert: table,
      values: values as TableInsert<TableDefinition>,
      returning
    } as InsertQuery<typeof returning>)) as unknown as Array<AnyRow>
    row = rows[0]
  }
  assign(result, row)

  for (const [key, rel] of rels) {
    const relData = getData(rel)
    if (relData.card !== 'many') continue
    if (!(key in inputRow) || !Array.isArray(inputRow[key])) continue
    const config = relationConfig(relData, api)
    const target = targetOf(relData.target)
    const targetApi = getTable(target)
    const targetKey = fieldKey(targetApi, config.to)
    const parentKey = fieldKey(api, config.from)
    const saved: Array<AnyRow> = []
    if (config.through) {
      const through = config.through
      const junctionApi = getTable(through.table)
      const junctionFromKey = fieldKey(junctionApi, through.from)
      const junctionToKey = fieldKey(junctionApi, through.to)
      const junctionFields = tableFields(
        junctionApi.aliased,
        junctionApi.columns
      )
      for (const childRow of inputRow[key] as Array<AnyRow>) {
        const child = yield* saveGraph(tx, target, childRow)
        const parentValue = row[parentKey]
        const targetValue = child[targetKey]
        const existing = (yield* tx.$query({
          select: junctionFields,
          from: through.table,
          where: and(
            eq(through.from, parentValue),
            eq(through.to, targetValue)
          ),
          first: true
        } as FirstSelectionQuery<typeof junctionFields>)) as AnyRow | null
        if (!existing)
          yield* tx.$query({
            insert: through.table,
            values: {
              [junctionFromKey]: parentValue,
              [junctionToKey]: targetValue
            } as TableInsert<TableDefinition>
          })
        saved.push(child)
      }
    } else
      for (const childRow of inputRow[key] as Array<AnyRow>)
        saved.push(
          yield* saveGraph(tx, target, {
            ...childRow,
            [targetKey]: row[parentKey]
          })
        )
    result[key] = saved
  }

  return result
}

export class Save<
  M extends Model,
  In,
  Meta extends QueryMeta
> extends Operation<Persisted<M, In>, Meta> {
  constructor(db: OrmDatabase<Meta>, model: M, input: In) {
    super(
      () =>
        db.transaction(
          txGenerator(function* (tx) {
            return yield* saveGraph(
              tx,
              model as unknown as HasTable,
              input as AnyRow
            )
          })
        ) as unknown as Deliver<Meta, Persisted<M, In>>
    )
  }
}
