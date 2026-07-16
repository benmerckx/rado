import {txGenerator} from '../universal/transactions.ts'
import {Callable} from '../util/Callable.ts'
import {Builder} from './Builder.ts'
import type {Transaction} from './Database.ts'
import type {Driver} from './Driver.ts'
import {count as countExpr} from './expr/Aggregate.ts'
import {and, eq, exists, not} from './expr/Conditions.ts'
import {Field} from './expr/Field.ts'
import {include, type Include} from './expr/Include.ts'
import {
  getData,
  getField,
  getTable,
  type HasField,
  type HasSql,
  type HasTable,
  type HasTarget
} from './Internal.ts'
import type {Deliver, QueryMeta} from './MetaData.ts'
import {Insert} from './query/Insert.ts'
import type {FromGuard, Join, SelectionQuery} from './query/Query.ts'
import {Select, SelectFirst} from './query/Select.ts'
import type {SelectionInput, SelectionRow} from './Selection.ts'
import {Sql, sql} from './Sql.ts'
import {
  alias,
  primaryKeyColumns,
  type Table,
  type TableDefinition,
  type TableFields,
  type TableInsert,
  type TableUpdate
} from './Table.ts'
import type {Expand} from './Types.ts'

export type ORMQuery<Input extends SelectionInput = SelectionInput> = Omit<
  SelectionQuery<Input>,
  'from' | 'select'
> & {
  select?: Input
  joins?: Array<Join>
}

export type TableSave<Definition extends TableDefinition> =
  | TableInsert<Definition>
  | TableUpdate<Definition>

type ModelDefinition<Model extends HasTable> =
  Model extends HasTable<infer Definition> ? Definition : never

type ModelName<Model extends HasTable> =
  Model extends HasTarget<infer Name> ? Name : string

type ModelRow<Model extends HasTable & object> = SelectionRow<
  ModelColumns<Model>
>

type RelationSaveInput<Relation> =
  Relation extends RelationDescriptor<infer Kind, infer Target>
    ? Kind extends 'many'
      ? ReadonlyArray<ModelSave<Target>>
      : ModelSave<Target> | null
    : never

export type ModelSave<Model extends HasTable & object> = TableSave<
  ModelDefinition<Model>
> & {
  [Key in keyof Model as RelationSaveInput<Model[Key]> extends never
    ? never
    : Key]?: RelationSaveInput<Model[Key]>
}

type RelationSaveResult<Relation, Input> =
  Relation extends RelationDescriptor<infer Kind, infer Target>
    ? Kind extends 'many'
      ? Input extends ReadonlyArray<infer Item>
        ? Array<ModelSaveResult<Target, Item>>
        : never
      : Input extends null
        ? null
        : ModelSaveResult<Target, Input>
    : never

export type ModelSaveResult<Model extends HasTable & object, Input> = Expand<
  ModelRow<Model> & {
    [Key in keyof Input & keyof Model as RelationSaveInput<
      Model[Key]
    > extends never
      ? never
      : Key]: RelationSaveResult<Model[Key], Input[Key]>
  }
>

function queryFrom(target: HasTarget, joins?: Array<Join>): FromGuard {
  return joins?.length ? [target, ...joins] : target
}

export type ModelColumns<Model> = {
  [Key in keyof Model as Key extends string
    ? Model[Key] extends HasSql
      ? Key
      : never
    : never]: Extract<Model[Key], HasSql>
}

export function columns<
  Definition extends TableDefinition,
  Name extends string
>(model: Table<Definition, Name>): TableFields<Definition, Name>
export function columns<Model extends HasTarget & object>(
  model: Model
): ModelColumns<Model>
export function columns(model: HasTarget & object): Record<string, HasSql> {
  const definition = getTable(model as HasTable).columns
  return Object.fromEntries(
    Object.keys(definition).map(name => [
      name,
      (model as Record<string, HasSql>)[name]
    ])
  )
}

export abstract class ORM<Meta extends QueryMeta> extends Builder<Meta> {
  abstract driver: Driver

  abstract transaction<Result>(
    run: (tx: Transaction<Meta>) => Deliver<Meta, Result>
  ): Deliver<Meta, Result>

  find<Returning extends SelectionInput>(
    model: HasTarget,
    query: ORMQuery<Returning> & {select: Returning}
  ): Select<Returning, Meta>
  find<Model extends HasTarget & object>(
    model: Model,
    query?: ORMQuery<ModelColumns<Model>>
  ): Select<ModelColumns<Model>, Meta>
  find(
    model: HasTarget & object,
    query: ORMQuery<any> = {}
  ): Select<any, Meta> {
    const {joins, ...selection} = query
    return new Select({
      ...getData(this),
      ...selection,
      from: queryFrom(model, joins),
      select: selection.select ?? columns(model)
    })
  }

  first<Returning extends SelectionInput>(
    model: HasTarget,
    query: ORMQuery<Returning> & {select: Returning}
  ): SelectFirst<Returning, Meta, true>
  first<Model extends HasTarget & object>(
    model: Model,
    query?: ORMQuery<ModelColumns<Model>>
  ): SelectFirst<ModelColumns<Model>, Meta, true>
  first(
    model: HasTarget & object,
    query: ORMQuery<any> = {}
  ): SelectFirst<any, Meta, true> {
    const {joins, ...selection} = query
    return new SelectFirst<any, Meta, true>({
      ...getData(this),
      ...selection,
      from: queryFrom(model, joins),
      select: selection.select ?? columns(model)
    })
  }

  count(
    model: HasTarget,
    query: {where?: HasSql<boolean>} = {}
  ): SelectFirst<Sql<number>, Meta> {
    return new SelectFirst({
      ...getData(this),
      from: model,
      select: countExpr(),
      where: query.where
    })
  }

  save<Model extends HasTable & object, const Inputs extends Array<object>>(
    model: Model,
    values: Inputs & Array<ModelSave<Model>>
  ): Deliver<Meta, Array<ModelSaveResult<Model, Inputs[number]>>>
  save<Model extends HasTable & object, const Input extends object>(
    model: Model,
    value: Input & ModelSave<Model>
  ): Deliver<Meta, ModelSaveResult<Model, Input>>
  save<Model extends HasTable & object>(
    model: Model,
    input: ModelSave<Model> | Array<ModelSave<Model>>
  ): Deliver<Meta, ModelRow<Model> | Array<ModelRow<Model>>> {
    const many = Array.isArray(input)
    const values = many ? input : [input]
    const run = txGenerator<
      Record<string, unknown> | Array<Record<string, unknown>>,
      Meta
    >(function* (tx) {
      const result = []
      for (const value of values)
        result.push(
          yield* saveRecord(tx, model, value as Record<string, unknown>)
        )
      return many ? result : result[0]!
    })

    // The save runner only uses the database API shared with Transaction.
    return (
      this.driver.supportsTransactions
        ? this.transaction(run)
        : run(this as unknown as Transaction<Meta>)
    ) as Deliver<Meta, ModelRow<Model> | Array<ModelRow<Model>>>
  }
}

function modelFieldKey(model: HasTable, field: HasField): string {
  const fieldName = getField(field).fieldName
  for (const [key, column] of Object.entries(getTable(model).columns)) {
    const columnName = getData(column).name ?? key
    if (columnName === fieldName) return key
  }
  throw new Error(`Relation field ${fieldName} does not belong to its model`)
}

interface SaveRelation {
  key: string
  kind: 'one' | 'many'
  target: HasTable & object
  from: string
  to: string
  through?: {
    target: HasTable & object
    from: string
    to: string
  }
}

interface SavePlan {
  model: HasTable & object
  target: Table<TableDefinition>
  columns: Array<string>
  selection: SelectionInput
  primary: Array<{key: string; field: HasSql}>
  relations: Array<SaveRelation>
}

const savePlans = new WeakMap<object, SavePlan>()

function savePlan(model: HasTable & object): SavePlan {
  const cached = savePlans.get(model)
  if (cached) return cached

  const table = getTable(model)
  const target = model as Table<TableDefinition>
  const primaryNames = primaryKeyColumns(table)
  const primary = Object.entries(table.columns).flatMap(([key, column]) => {
    const data = getData(column)
    const fieldName = data.name ?? key
    return primaryNames.has(fieldName) ? [{key, field: target[key]}] : []
  })
  const relations = Object.entries(model).flatMap(([key, value]) => {
    if (typeof value !== 'function' || !(relationData in (value as object)))
      return []
    const data = (
      value as RelationDescriptor<'one' | 'many', HasTable & object>
    )[relationData]
    const through = data.options.through
    return [
      {
        key,
        kind: data.kind,
        target: data.target,
        from: modelFieldKey(model, data.options.from),
        to: modelFieldKey(data.target, data.options.to),
        through: through && {
          target: through.table,
          from: modelFieldKey(through.table, through.from),
          to: modelFieldKey(through.table, through.to)
        }
      }
    ]
  })

  const plan = {
    model,
    target,
    columns: Object.keys(table.columns),
    selection: columns(model),
    primary,
    relations
  }
  savePlans.set(model, plan)
  return plan
}

function physicalRecord(
  plan: SavePlan,
  value: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(plan.columns.map(key => [key, value[key]]))
}

function* savePhysical<Meta extends QueryMeta>(
  tx: Transaction<Meta>,
  plan: SavePlan,
  value: Record<string, unknown>
): Generator<Promise<unknown>, Record<string, unknown>, unknown> {
  const {model, target, primary} = plan
  const hasPrimary =
    primary.length > 0 && primary.every(({key}) => value[key] !== undefined)

  if (hasPrimary) {
    const where = and(...primary.map(({key, field}) => eq(field, value[key])))
    const update = Object.fromEntries(
      Object.entries(value).filter(
        ([key, fieldValue]) =>
          fieldValue !== undefined &&
          !primary.some(primary => primary.key === key)
      )
    ) as TableUpdate<TableDefinition>

    if (Object.keys(update).length > 0)
      yield* tx.update(target).set(update).where(where)

    const existing = yield* tx.first(model, {where})
    if (existing) return existing as Record<string, unknown>

    yield* new Insert<void, Meta>({
      ...getData(tx),
      insert: target,
      values: value as TableInsert<TableDefinition>,
      overridingSystemValue: tx.dialect.runtime === 'postgres'
    })
    const inserted = yield* tx.first(model, {where})
    if (!inserted) throw new Error('save() could not reload the inserted row')
    return inserted as Record<string, unknown>
  }

  if (tx.dialect.runtime !== 'mysql') {
    const inserted = yield* new Insert<SelectionInput, Meta>({
      ...getData(tx),
      insert: target,
      values: value as TableInsert<TableDefinition>,
      returning: plan.selection
    })
    if (!inserted[0]) throw new Error('save() did not return the inserted row')
    return inserted[0] as Record<string, unknown>
  }

  if (primary.length !== 1)
    throw new Error(
      'save() requires a supplied primary key or one generated primary key on MySQL'
    )
  const mutation = yield* new Insert<void, Meta>({
    ...getData(tx),
    insert: target,
    values: value as TableInsert<TableDefinition>
  })
  if (mutation.insertId === undefined)
    throw new Error('save() did not receive an inserted primary key')
  const where = eq(primary[0].field, mutation.insertId)
  const inserted = yield* tx.first(model, {where})
  if (!inserted) throw new Error('save() could not reload the inserted row')
  return inserted as Record<string, unknown>
}

function* saveRecord<Meta extends QueryMeta>(
  tx: Transaction<Meta>,
  model: HasTable & object,
  input: Record<string, unknown>
): Generator<Promise<unknown>, Record<string, unknown>, unknown> {
  const plan = savePlan(model)
  const value = physicalRecord(plan, input)
  const included: Record<string, unknown> = {}

  for (const relation of plan.relations) {
    const {key, from, target, to} = relation
    if (relation.kind !== 'one' || input[key] === undefined) continue
    if (input[key] === null) {
      value[from] = null
      included[key] = null
      continue
    }
    if (typeof input[key] !== 'object')
      throw new Error(`Relation ${key} must be an object or null`)
    const related = yield* saveRecord(
      tx,
      target,
      input[key] as Record<string, unknown>
    )
    value[from] = related[to]
    included[key] = related
  }

  const saved = yield* savePhysical(tx, plan, value)

  for (const relation of plan.relations) {
    const {key, from, target, through, to} = relation
    if (relation.kind !== 'many' || input[key] === undefined) continue
    if (!Array.isArray(input[key]))
      throw new Error(`Relation ${key} must be an array`)
    const related = []
    for (const child of input[key]) {
      if (!child || typeof child !== 'object')
        throw new Error(`Relation ${key} must contain objects`)
      const savedChild = yield* saveRecord(
        tx,
        target,
        through
          ? (child as Record<string, unknown>)
          : {
              ...(child as Record<string, unknown>),
              [to]: saved[from]
            }
      )
      if (through)
        yield* saveRecord(tx, through.target, {
          [through.from]: saved[from],
          [through.to]: savedChild[to]
        })
      related.push(savedChild)
    }
    included[key] = related
  }

  return {...saved, ...included}
}

export interface RelationOptions<FromName extends string = string> {
  from: HasSql & HasField & Field<unknown, FromName>
  to: HasSql & HasField
  alias?: string
}

export interface RelationThrough {
  table: HasTable & object
  from: HasSql & HasField
  to: HasSql & HasField
}

export interface ManyRelationOptions<
  FromName extends string = string
> extends RelationOptions<FromName> {
  through?: RelationThrough
}

const relationData: unique symbol = Symbol()

interface RelationData<
  Kind extends 'one' | 'many',
  Target extends HasTable & object
> {
  kind: Kind
  target: Target
  options: ManyRelationOptions
}

interface RelationDescriptor<
  Kind extends 'one' | 'many',
  Target extends HasTable & object
> {
  readonly [relationData]: RelationData<Kind, Target>
}

type RelationQueryFactory<
  Definition extends TableDefinition,
  Input extends SelectionInput
> = (parent: TableFields<Definition>) => ORMQuery<Input>

type SelfRelationQueryFactory<
  Definition extends TableDefinition,
  TargetName extends string,
  FromName extends string,
  Input extends SelectionInput
> = [FromName] extends [TargetName]
  ? RelationQueryFactory<Definition, Input>
  : never

export interface RelationPredicateQuery {
  where?: HasSql<boolean>
  joins?: Array<Join>
}

type RelationPredicateFactory<Definition extends TableDefinition> = (
  parent: TableFields<Definition>
) => RelationPredicateQuery

type SelfRelationPredicateFactory<
  Definition extends TableDefinition,
  TargetName extends string,
  FromName extends string
> = [FromName] extends [TargetName]
  ? RelationPredicateFactory<Definition>
  : never

export interface ManyRelation<
  Target extends HasTable & object,
  FromName extends string
> extends RelationDescriptor<'many', Target> {
  (): Include<Array<ModelRow<Target>>>
  (
    query: ORMQuery<TableFields<ModelDefinition<Target>, ModelName<Target>>>
  ): Include<Array<ModelRow<Target>>>
  <Input extends SelectionInput>(
    query: ORMQuery<Input> & {select: Input}
  ): Include<Array<SelectionRow<Input>>>
  <Input extends SelectionInput>(
    query: SelfRelationQueryFactory<
      ModelDefinition<Target>,
      ModelName<Target>,
      FromName,
      Input
    >
  ): Include<Array<SelectionRow<Input>>>
}

export interface OneRelation<
  Target extends HasTable & object,
  FromName extends string
> extends RelationDescriptor<'one', Target> {
  (): Include<ModelRow<Target> | null>
  (
    query: ORMQuery<TableFields<ModelDefinition<Target>, ModelName<Target>>>
  ): Include<ModelRow<Target> | null>
  <Input extends SelectionInput>(
    query: ORMQuery<Input> & {select: Input}
  ): Include<SelectionRow<Input> | null>
  <Input extends SelectionInput>(
    query: SelfRelationQueryFactory<
      ModelDefinition<Target>,
      ModelName<Target>,
      FromName,
      Input
    >
  ): Include<SelectionRow<Input> | null>
}

let relationId = 0

function relationAlias(): string {
  relationId += 1
  return `__rado_relation_${relationId}`
}

function parentFields<Definition extends TableDefinition>(
  target: Table<Definition>
): TableFields<Definition> {
  return Object.fromEntries(
    Object.entries(columns(target)).map(([name, value]) => {
      const field = getField(value)
      return [name, new Field(Sql.SELF_TARGET, field.fieldName, field.source)]
    })
  ) as TableFields<Definition>
}

function relationSource(from: HasSql & HasField, targetName: string): HasSql {
  const field = getField(from)
  if (field.targetName !== targetName) return from
  return new Field(Sql.SELF_TARGET, field.fieldName, field.source)
}

type RelationInput<Definition extends TableDefinition> =
  | ORMQuery
  | RelationQueryFactory<Definition, any>
  | RelationPredicateQuery
  | RelationPredicateFactory<Definition>

abstract class Relation<
  Kind extends 'one' | 'many',
  Target extends HasTable & object,
  FromName extends string
>
  extends Callable
  implements RelationDescriptor<Kind, Target>
{
  readonly [relationData]: RelationData<Kind, Target>
  readonly #relationTable: Table<ModelDefinition<Target>, ModelName<Target>>
  readonly #targetName: string
  readonly #sourceName: string
  readonly #parent: TableFields<ModelDefinition<Target>>
  #invocationId = 0

  constructor(
    readonly kind: Kind,
    readonly target: Target,
    readonly options: ManyRelationOptions<FromName>
  ) {
    let callable!: Relation<Kind, Target, FromName>
    super((input?: RelationInput<ModelDefinition<Target>>) =>
      callable.load(input)
    )
    callable = this
    this[relationData] = {kind, target, options}
    this.#relationTable = target as unknown as Table<
      ModelDefinition<Target>,
      ModelName<Target>
    >
    this.#targetName = getTable(target).aliased
    this.#sourceName = getField(options.from).targetName
    this.#parent = parentFields(this.#relationTable)
  }

  #resolve(input?: RelationInput<ModelDefinition<Target>>): ORMQuery {
    if (typeof input === 'function' && this.#sourceName !== this.#targetName)
      throw new Error(
        'Relation callbacks are only available for self-relations'
      )
    return typeof input === 'function' ? input(this.#parent) : (input ?? {})
  }

  #correlated(query: ORMQuery, select: SelectionInput) {
    const {joins, ...selection} = query
    this.#invocationId += 1
    const name = this.options.alias
      ? this.#invocationId === 1
        ? this.options.alias
        : `${this.options.alias}_${this.#invocationId}`
      : relationAlias()
    const relationTarget = alias(this.#relationTable, name)
    const through = this.options.through
    let from: FromGuard
    let relationWhere: HasSql<boolean>
    if (through) {
      const throughTable = through.table as Table<TableDefinition>
      const throughTarget = alias(throughTable, `${name}_through`)
      const throughFrom =
        throughTarget[modelFieldKey(throughTable, through.from)]
      const throughTo = throughTarget[modelFieldKey(throughTable, through.to)]
      from = queryFrom(relationTarget, [
        {innerJoin: throughTarget, on: eq(this.options.to, throughTo)},
        ...(joins ?? [])
      ])
      relationWhere = eq(
        throughFrom,
        relationSource(this.options.from, this.#targetName)
      )
    } else {
      from = queryFrom(relationTarget, joins)
      relationWhere = eq(
        this.options.to,
        relationSource(this.options.from, this.#targetName)
      )
    }
    const data = {
      ...selection,
      from,
      select,
      where: and(relationWhere, selection.where)
    }
    const targetScope = {sourceName: this.#targetName, name}
    return {data, targetScope}
  }

  private load(input?: RelationInput<ModelDefinition<Target>>) {
    const query = this.#resolve(input)
    const {data, targetScope} = this.#correlated(
      query,
      query.select ?? columns(this.target)
    )
    const scoped = new Select(data)
    return this.kind === 'one'
      ? include.one(scoped, targetScope)
      : include(scoped, targetScope)
  }

  protected predicate(
    input:
      | RelationPredicateQuery
      | RelationPredicateFactory<ModelDefinition<Target>>
      | undefined,
    options: {negateExists?: boolean; negateWhere?: boolean} = {}
  ): Sql<boolean> {
    const query = this.#resolve(input)
    const where = options.negateWhere ? not(query.where ?? and()) : query.where
    const {data, targetScope} = this.#correlated({...query, where}, sql`1`)
    const condition = exists(new Select(data)).scopeTarget(
      targetScope.sourceName,
      targetScope.name
    )
    return options.negateExists ? not(condition) : condition
  }
}

export class OneRelation<
  Target extends HasTable & object,
  FromName extends string
> extends Relation<'one', Target, FromName> {
  constructor(target: Target, options: RelationOptions<FromName>) {
    super('one', target, options)
  }

  is(query?: RelationPredicateQuery): Sql<boolean>
  is(
    query: SelfRelationPredicateFactory<
      ModelDefinition<Target>,
      ModelName<Target>,
      FromName
    >
  ): Sql<boolean>
  is(
    query?:
      | RelationPredicateQuery
      | RelationPredicateFactory<ModelDefinition<Target>>
  ): Sql<boolean> {
    return this.predicate(query)
  }

  isNot(query?: RelationPredicateQuery): Sql<boolean>
  isNot(
    query: SelfRelationPredicateFactory<
      ModelDefinition<Target>,
      ModelName<Target>,
      FromName
    >
  ): Sql<boolean>
  isNot(
    query?:
      | RelationPredicateQuery
      | RelationPredicateFactory<ModelDefinition<Target>>
  ): Sql<boolean> {
    return this.predicate(query, {negateExists: true})
  }
}

export class ManyRelation<
  Target extends HasTable & object,
  FromName extends string
> extends Relation<'many', Target, FromName> {
  constructor(target: Target, options: ManyRelationOptions<FromName>) {
    super('many', target, options)
  }

  some(query?: RelationPredicateQuery): Sql<boolean>
  some(
    query: SelfRelationPredicateFactory<
      ModelDefinition<Target>,
      ModelName<Target>,
      FromName
    >
  ): Sql<boolean>
  some(
    query?:
      | RelationPredicateQuery
      | RelationPredicateFactory<ModelDefinition<Target>>
  ): Sql<boolean> {
    return this.predicate(query)
  }

  none(query?: RelationPredicateQuery): Sql<boolean>
  none(
    query: SelfRelationPredicateFactory<
      ModelDefinition<Target>,
      ModelName<Target>,
      FromName
    >
  ): Sql<boolean>
  none(
    query?:
      | RelationPredicateQuery
      | RelationPredicateFactory<ModelDefinition<Target>>
  ): Sql<boolean> {
    return this.predicate(query, {negateExists: true})
  }

  every(query?: RelationPredicateQuery): Sql<boolean>
  every(
    query: SelfRelationPredicateFactory<
      ModelDefinition<Target>,
      ModelName<Target>,
      FromName
    >
  ): Sql<boolean>
  every(
    query?:
      | RelationPredicateQuery
      | RelationPredicateFactory<ModelDefinition<Target>>
  ): Sql<boolean> {
    return this.predicate(query, {
      negateExists: true,
      negateWhere: true
    })
  }
}

export function one<Target extends HasTable & object, FromName extends string>(
  target: Target,
  options: RelationOptions<FromName>
): OneRelation<Target, FromName> {
  return new OneRelation(target, options)
}

export function many<Target extends HasTable & object, FromName extends string>(
  target: Target,
  options: ManyRelationOptions<FromName>
): ManyRelation<Target, FromName> {
  return new ManyRelation(target, options)
}
