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
import type {RowOfRecord, SelectionInput, SelectionRow} from './Selection.ts'
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

type ModelSelection<Model extends object> = {
  [Key in keyof Model as Model[Key] extends (...args: Array<any>) => any
    ? never
    : Key]: Model[Key]
}

type ModelRow<Model extends HasTable & object> = RowOfRecord<Model>

type RelationSaveInput<Relation> =
  Relation extends RelationDescriptor<infer Kind, infer Target, infer Required>
    ? Kind extends 'many'
      ? ReadonlyArray<ModelSave<Target>>
      : ModelSave<Target> | ([Required] extends [true] ? never : null)
    : never

export type ModelSave<Model extends HasTable & object> = TableSave<
  ModelDefinition<Model>
> & {
  [Key in keyof Model as RelationSaveInput<Model[Key]> extends never
    ? never
    : Key]?: RelationSaveInput<Model[Key]>
}

type RelationSaveResult<Relation, Input> =
  Relation extends RelationDescriptor<infer Kind, infer Target, boolean>
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
    query?: ORMQuery<Model>
  ): Select<ModelSelection<Model>, Meta>
  find(
    model: HasTarget & object,
    query: ORMQuery<any> = {}
  ): Select<any, Meta> {
    const {joins, ...selection} = query
    return new Select({
      ...getData(this),
      ...selection,
      from: queryFrom(model, joins),
      select: selection.select ?? model
    })
  }

  first<Returning extends SelectionInput>(
    model: HasTarget,
    query: ORMQuery<Returning> & {select: Returning}
  ): SelectFirst<Returning, Meta, true>
  first<Model extends HasTarget & object>(
    model: Model,
    query?: ORMQuery<Model>
  ): SelectFirst<ModelSelection<Model>, Meta, true>
  first(
    model: HasTarget & object,
    query: ORMQuery<any> = {}
  ): SelectFirst<any, Meta, true> {
    const {joins, ...selection} = query
    return new SelectFirst<any, Meta, true>({
      ...getData(this),
      ...selection,
      from: queryFrom(model, joins),
      select: selection.select ?? model
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
  from: Array<string>
  to: Array<string>
  required: boolean
  where?: HasSql<boolean>
  through?: {
    target: HasTable & object
    from: Array<string>
    to: Array<string>
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
      value as RelationDescriptor<'one' | 'many', HasTable & object, boolean>
    )[relationData]
    const through = data.options.through
    return [
      {
        key,
        kind: data.kind,
        target: data.target,
        from: relationFields(data.options.from).map(field =>
          modelFieldKey(model, field)
        ),
        to: relationFields(data.options.to).map(field =>
          modelFieldKey(data.target, field)
        ),
        required: data.required,
        where: data.options.where,
        through: through && {
          target: through.table,
          from: relationFields(through.from).map(field =>
            modelFieldKey(through.table, field)
          ),
          to: relationFields(through.to).map(field =>
            modelFieldKey(through.table, field)
          )
        }
      }
    ]
  })

  const plan = {
    model,
    target,
    columns: Object.keys(table.columns),
    selection: model,
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

function* validateRelationScope<Meta extends QueryMeta>(
  tx: Transaction<Meta>,
  relation: SaveRelation,
  saved: Record<string, unknown>
): Generator<Promise<unknown>, void, unknown> {
  if (!relation.where) return
  const plan = savePlan(relation.target)
  if (plan.primary.length === 0)
    throw new Error(
      `Scoped relation ${relation.key} requires a primary key on its target`
    )
  const where = and(
    ...plan.primary.map(({key, field}) => eq(field, saved[key])),
    relation.where
  )
  const related = yield* tx.first(relation.target, {where})
  if (!related)
    throw new Error(`Saved value does not match relation ${relation.key}`)
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
    const {key, from, required, target, to} = relation
    if (relation.kind !== 'one') continue
    if (
      required &&
      (input[key] === null || from.some(field => input[field] === null))
    )
      throw new Error(`Required relation ${key} cannot be null`)
    if (input[key] === undefined) continue
    if (input[key] === null) {
      for (const field of from) value[field] = null
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
    yield* validateRelationScope(tx, relation, related)
    for (let index = 0; index < from.length; index++)
      value[from[index]!] = related[to[index]!]
    included[key] = related
  }

  const saved = yield* savePhysical(tx, plan, value)

  for (const relation of plan.relations) {
    if (relation.kind !== 'one' || !relation.required) continue
    const values = relation.from.map(field => saved[field])
    if (values.some(value => value === null || value === undefined))
      throw new Error(`Required relation ${relation.key} is missing`)
    const where = and(
      ...relation.to.map((field, index) =>
        eq((relation.target as Record<string, HasSql>)[field], values[index])
      ),
      relation.where
    )
    const related = yield* tx.first(relation.target, {where})
    if (!related)
      throw new Error(`Required relation ${relation.key} is missing`)
  }

  for (const relation of plan.relations) {
    const {key, from, target, through, to} = relation
    if (relation.kind !== 'many' || input[key] === undefined) continue
    if (!Array.isArray(input[key]))
      throw new Error(`Relation ${key} must be an array`)
    const related = []
    for (const child of input[key]) {
      if (!child || typeof child !== 'object')
        throw new Error(`Relation ${key} must contain objects`)
      const childInput = {...(child as Record<string, unknown>)}
      if (!through)
        for (let index = 0; index < to.length; index++)
          childInput[to[index]!] = saved[from[index]!]
      const savedChild = yield* saveRecord(tx, target, childInput)
      yield* validateRelationScope(tx, relation, savedChild)
      if (through) {
        const join: Record<string, unknown> = {}
        for (let index = 0; index < through.from.length; index++)
          join[through.from[index]!] = saved[from[index]!]
        for (let index = 0; index < through.to.length; index++)
          join[through.to[index]!] = savedChild[to[index]!]
        yield* saveRecord(tx, through.target, join)
      }
      related.push(savedChild)
    }
    included[key] = related
  }

  return {...saved, ...included}
}

type RelationField<FromName extends string = string> = HasSql &
  HasField &
  Field<unknown, FromName>

export type RelationFields<FromName extends string = string> =
  | RelationField<FromName>
  | ReadonlyArray<RelationField<FromName>>

interface RelationBaseOptions<FromName extends string = string> {
  from: RelationFields<FromName>
  to: RelationFields
  alias?: string
  where?: HasSql<boolean>
}

export interface RelationOptions<
  FromName extends string = string,
  Required extends boolean = false
> extends RelationBaseOptions<FromName> {
  required?: Required
}

export interface RelationThrough {
  table: HasTable & object
  from: RelationFields
  to: RelationFields
}

export interface ManyRelationOptions<
  FromName extends string = string
> extends RelationBaseOptions<FromName> {
  through?: RelationThrough
}

type AnyRelationOptions<FromName extends string = string> =
  ManyRelationOptions<FromName> & {required?: boolean}

const relationData: unique symbol = Symbol()

interface RelationData<
  Kind extends 'one' | 'many',
  Target extends HasTable & object,
  Required extends boolean = false
> {
  kind: Kind
  target: Target
  options: AnyRelationOptions
  required: Required
}

interface RelationDescriptor<
  Kind extends 'one' | 'many',
  Target extends HasTable & object,
  Required extends boolean = false
> {
  readonly [relationData]: RelationData<Kind, Target, Required>
}

type RelationQueryFactory<
  Definition extends TableDefinition,
  Input extends SelectionInput
> = (parent: TableFields<Definition>) => ORMQuery<Input>

type RelationQueryCallback<
  Definition extends TableDefinition,
  TargetName extends string,
  FromName extends string,
  Input extends SelectionInput
> = [FromName] extends [TargetName]
  ? RelationQueryFactory<Definition, Input>
  : () => ORMQuery<Input>

export interface RelationPredicateQuery {
  where?: HasSql<boolean>
  joins?: Array<Join>
}

type RelationPredicateFactory<Definition extends TableDefinition> = (
  parent: TableFields<Definition>
) => RelationPredicateQuery

type RelationPredicateCallback<
  Definition extends TableDefinition,
  TargetName extends string,
  FromName extends string
> = [FromName] extends [TargetName]
  ? RelationPredicateFactory<Definition>
  : () => RelationPredicateQuery

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
    query: RelationQueryCallback<
      ModelDefinition<Target>,
      ModelName<Target>,
      FromName,
      Input
    >
  ): Include<Array<SelectionRow<Input>>>
}

export interface OneRelation<
  Target extends HasTable & object,
  FromName extends string,
  Required extends boolean = false
> extends RelationDescriptor<'one', Target, Required> {
  (): Include<ModelRow<Target> | ([Required] extends [true] ? never : null)>
  (
    query: ORMQuery<TableFields<ModelDefinition<Target>, ModelName<Target>>>
  ): Include<ModelRow<Target> | ([Required] extends [true] ? never : null)>
  <Input extends SelectionInput>(
    query: ORMQuery<Input> & {select: Input}
  ): Include<SelectionRow<Input> | ([Required] extends [true] ? never : null)>
  <Input extends SelectionInput>(
    query: RelationQueryCallback<
      ModelDefinition<Target>,
      ModelName<Target>,
      FromName,
      Input
    >
  ): Include<SelectionRow<Input> | ([Required] extends [true] ? never : null)>
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
    Object.keys(getTable(target).columns).map(name => {
      const value = target[name]
      const field = getField(value as HasField)
      return [name, new Field(Sql.SELF_TARGET, field.fieldName, field.source)]
    })
  ) as TableFields<Definition>
}

function relationSource(from: HasSql & HasField, targetName: string): HasSql {
  const field = getField(from)
  if (field.targetName !== targetName) return from
  return new Field(Sql.SELF_TARGET, field.fieldName, field.source)
}

function relationFields<FromName extends string>(
  fields: RelationFields<FromName>
): Array<RelationField<FromName>> {
  return Array.isArray(fields)
    ? [...fields]
    : [fields as RelationField<FromName>]
}

function pairedRelationFields(
  left: RelationFields,
  right: RelationFields,
  description: string
): Array<[RelationField, RelationField]> {
  const leftFields = relationFields(left)
  const rightFields = relationFields(right)
  if (leftFields.length !== rightFields.length)
    throw new Error(`${description} must contain the same number of fields`)
  return leftFields.map((field, index) => [field, rightFields[index]!])
}

type RelationInput<Definition extends TableDefinition> =
  | ORMQuery
  | RelationQueryFactory<Definition, any>
  | RelationPredicateQuery
  | RelationPredicateFactory<Definition>

abstract class Relation<
  Kind extends 'one' | 'many',
  Target extends HasTable & object,
  FromName extends string,
  Required extends boolean = false
>
  extends Callable
  implements RelationDescriptor<Kind, Target, Required>
{
  readonly [relationData]: RelationData<Kind, Target, Required>
  readonly #relationTable: Table<ModelDefinition<Target>, ModelName<Target>>
  readonly #targetName: string
  readonly #sourceName: string
  readonly #parent: TableFields<ModelDefinition<Target>>
  #invocationId = 0

  constructor(
    readonly kind: Kind,
    readonly target: Target,
    readonly options: AnyRelationOptions<FromName>
  ) {
    super((input?: RelationInput<ModelDefinition<Target>>) => this.load(input))
    const required = Boolean(options.required) as Required
    this[relationData] = {kind, target, options, required}
    this.#relationTable = target as unknown as Table<
      ModelDefinition<Target>,
      ModelName<Target>
    >
    this.#targetName = getTable(target).aliased
    const from = relationFields(options.from)
    this.#sourceName = getField(from[0]!).targetName
    if (from.some(field => getField(field).targetName !== this.#sourceName))
      throw new Error('Relation from fields must belong to the same model')
    if (options.through) {
      pairedRelationFields(
        options.from,
        options.through.from,
        'Relation from and through.from'
      )
      pairedRelationFields(
        options.to,
        options.through.to,
        'Relation to and through.to'
      )
    } else {
      pairedRelationFields(options.from, options.to, 'Relation from and to')
    }
    this.#parent = parentFields(this.#relationTable)
  }

  #resolve(input?: RelationInput<ModelDefinition<Target>>): ORMQuery {
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
      const throughFrom = relationFields(through.from).map(
        field => throughTarget[modelFieldKey(throughTable, field)]
      )
      const throughTo = relationFields(through.to).map(
        field => throughTarget[modelFieldKey(throughTable, field)]
      )
      const targetPairs = pairedRelationFields(
        this.options.to,
        through.to,
        'Relation to and through.to'
      )
      const sourcePairs = pairedRelationFields(
        this.options.from,
        through.from,
        'Relation from and through.from'
      )
      from = queryFrom(relationTarget, [
        {
          innerJoin: throughTarget,
          on: and(...targetPairs.map(([to], index) => eq(to, throughTo[index])))
        },
        ...(joins ?? [])
      ])
      relationWhere = and(
        ...sourcePairs.map(([outer], index) =>
          eq(throughFrom[index], relationSource(outer, this.#targetName))
        )
      )
    } else {
      from = queryFrom(relationTarget, joins)
      relationWhere = and(
        ...pairedRelationFields(
          this.options.to,
          this.options.from,
          'Relation from and to'
        ).map(([to, outer]) => eq(to, relationSource(outer, this.#targetName)))
      )
    }
    const data = {
      ...selection,
      from,
      select,
      where: and(relationWhere, this.options.where, selection.where)
    }
    const targetScope = {sourceName: this.#targetName, name}
    return {data, targetScope}
  }

  private load(input?: RelationInput<ModelDefinition<Target>>) {
    const query = this.#resolve(input)
    const {data, targetScope} = this.#correlated(
      query,
      query.select ?? this.target
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
  FromName extends string,
  Required extends boolean = false
> extends Relation<'one', Target, FromName, Required> {
  constructor(target: Target, options: RelationOptions<FromName, Required>) {
    super('one', target, options)
  }

  is(query?: RelationPredicateQuery): Sql<boolean>
  is(
    query: RelationPredicateCallback<
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
    query: RelationPredicateCallback<
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
> extends Relation<'many', Target, FromName, false> {
  constructor(target: Target, options: ManyRelationOptions<FromName>) {
    super('many', target, options)
  }

  some(query?: RelationPredicateQuery): Sql<boolean>
  some(
    query: RelationPredicateCallback<
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
    query: RelationPredicateCallback<
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
    query: RelationPredicateCallback<
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

export function one<
  Target extends HasTable & object,
  FromName extends string,
  Required extends boolean = false
>(
  target: Target,
  options: RelationOptions<FromName, Required>
): OneRelation<Target, FromName, Required> {
  return new OneRelation(target, options)
}

export function many<Target extends HasTable & object, FromName extends string>(
  target: Target,
  options: ManyRelationOptions<FromName>
): ManyRelation<Target, FromName> {
  return new ManyRelation(target, options)
}
