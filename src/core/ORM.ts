import {txGenerator} from '../universal/transactions.ts'
import {Callable} from '../util/Callable.ts'
import {Builder} from './Builder.ts'
import type {Transaction} from './Database.ts'
import type {Driver} from './Driver.ts'
import {count as countExpr} from './expr/Aggregate.ts'
import {and, eq, exists as existsExpr, not, or} from './expr/Conditions.ts'
import {Field} from './expr/Field.ts'
import {include, type Include} from './expr/Include.ts'
import {
  getData,
  getField,
  getRelation,
  getSql,
  getTable,
  hasRelation,
  hasSql,
  internalRelation,
  type HasField,
  type HasRelation,
  type HasSql,
  type HasTable,
  type HasTarget
} from './Internal.ts'
import type {Deliver, IsPostgres, IsSqlite, QueryMeta} from './MetaData.ts'
import {Executable} from './Queries.ts'
import type {FromGuard, Join, SelectionQuery} from './query/Query.ts'
import {Select, SelectFirst} from './query/Select.ts'
import type {RowOfRecord, SelectionInput, SelectionRow} from './Selection.ts'
import {Sql, sql, type TargetScope} from './Sql.ts'
import {
  alias,
  type Table,
  type TableDefinition,
  type TableFields,
  type TableInsert,
  type TableUpdate,
  tableFields
} from './Table.ts'

export type ORMQuery<Input extends SelectionInput = SelectionInput> = Omit<
  SelectionQuery<Input>,
  'from' | 'select'
> & {
  select?: Input
  joins?: Array<Join>
}

type ModelDefinition<Model extends HasTable> =
  Model extends HasTable<infer Definition> ? Definition : never

type ModelName<Model extends HasTable> =
  Model extends HasTarget<infer Name> ? Name : string

type ModelSelection<Model extends object> = {
  [Key in keyof Model as Model[Key] extends (...args: Array<any>) => any
    ? never
    : Key]: Model[Key]
}

type ModelRow<Model extends HasTable> = RowOfRecord<Model>

declare const internalRootMutation: unique symbol

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
  find<Model extends HasTarget>(
    model: Model,
    query?: ORMQuery<Model>
  ): Select<ModelSelection<Model>, Meta>
  find(model: HasTarget, query: ORMQuery<any> = {}): Select<any, Meta> {
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
  first<Model extends HasTarget>(
    model: Model,
    query?: ORMQuery<Model>
  ): SelectFirst<ModelSelection<Model>, Meta, true>
  first(
    model: HasTarget,
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

  write<Model extends HasTable>(model: Model): ModelWriteStart<Model, Meta> {
    return new ModelWriteStart(this, [], model)
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
  table: HasTable
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

interface RelationData<Target extends HasTable> {
  target: Target
  options: AnyRelationOptions
  scope: string
  predicate(
    input?: RelationPredicateQuery | HasSql<boolean>,
    options?: {negateExists?: boolean; negateWhere?: boolean}
  ): Sql<boolean>
}

interface RelationDescriptor<Target extends HasTable> extends HasRelation<
  RelationData<Target>
> {}

type RelationModel<Target extends object> = {
  [Key in keyof Target as Target[Key] extends
    | HasField
    | RelationDescriptor<HasTable>
    ? Key
    : never]: Target[Key]
}

export interface RelationPredicateQuery {
  where?: HasSql<boolean>
  joins?: Array<Join>
}

export interface ManyRelation<
  Target extends HasTable,
  FromName extends string
> extends RelationDescriptor<Target> {
  (): Include<Array<ModelRow<Target>>>
  (
    query: ORMQuery<TableFields<ModelDefinition<Target>, ModelName<Target>>>
  ): Include<Array<ModelRow<Target>>>
  <Input extends SelectionInput>(
    query: ORMQuery<Input> & {select: Input}
  ): Include<Array<SelectionRow<Input>>>
}

export interface OneRelation<
  Target extends HasTable,
  FromName extends string,
  Required extends boolean = false
> extends RelationDescriptor<Target> {
  (): Include<ModelRow<Target> | ([Required] extends [true] ? never : null)>
  (
    query: ORMQuery<TableFields<ModelDefinition<Target>, ModelName<Target>>>
  ): Include<ModelRow<Target> | ([Required] extends [true] ? never : null)>
  <Input extends SelectionInput>(
    query: ORMQuery<Input> & {select: Input}
  ): Include<SelectionRow<Input> | ([Required] extends [true] ? never : null)>
}

let relationId = 0

function relationAlias(): string {
  relationId += 1
  return `__rado_relation_${relationId}`
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

type RelationInput = ORMQuery

abstract class Relation<
  Target extends HasTable,
  FromName extends string,
  Options extends AnyRelationOptions<FromName>
>
  extends Callable
  implements RelationDescriptor<Target>
{
  readonly [internalRelation]: RelationData<Target>
  readonly #relationTable: Table<ModelDefinition<Target>, ModelName<Target>>
  readonly #targetName: string
  readonly #sourceName: string
  readonly #sourceScope: string
  readonly #scopeName: string
  readonly #selection: SelectionInput
  readonly #sourcePairs?: Array<[RelationField, RelationField]>
  readonly #targetPairs: Array<[RelationField, RelationField]>
  readonly #include: (select: Select<any>, scope: TargetScope) => Include<any>
  #invocationId = 0

  constructor(
    target: Target,
    options: Options,
    includeRelation: (select: Select<any>, scope: TargetScope) => Include<any>,
    sourceScope?: string
  ) {
    super((input?: RelationInput) => this.#load(input))
    this.#include = includeRelation
    this.#relationTable = target as unknown as Table<
      ModelDefinition<Target>,
      ModelName<Target>
    >
    this.#targetName = getTable(target).aliased
    this.#scopeName = relationAlias()
    this[internalRelation] = {
      target,
      options,
      scope: this.#scopeName,
      predicate: (input, options) => this.#predicate(input, options)
    }
    const from = relationFields(options.from)
    this.#sourceName = getField(from[0]!).targetName
    this.#sourceScope = sourceScope ?? this.#sourceName
    if (from.some(field => getField(field).targetName !== this.#sourceName))
      throw new Error('Relation from fields must belong to the same model')
    if (options.through) {
      this.#sourcePairs = pairedRelationFields(
        options.from,
        options.through.from,
        'Relation from and through.from'
      )
      this.#targetPairs = pairedRelationFields(
        options.to,
        options.through.to,
        'Relation to and through.to'
      )
    } else {
      this.#targetPairs = pairedRelationFields(
        options.to,
        options.from,
        'Relation from and to'
      )
    }
    const selection = tableFields(this.#scopeName, getTable(target).columns)
    for (const [key, field] of Object.entries(selection))
      Object.defineProperty(this, key, {
        value: field,
        enumerable: true,
        configurable: true
      })
    for (const [key, value] of Object.entries(target)) {
      if (typeof value === 'function' && hasRelation(value)) {
        let scoped: OneRelation<any, any, any> | ManyRelation<any, any>
        Object.defineProperty(this, key, {
          get: () => {
            if (scoped) return scoped
            const data = getRelation(value as WriteRelation)
            scoped =
              value instanceof OneRelation
                ? new OneRelation(data.target, data.options, this.#scopeName)
                : new ManyRelation(data.target, data.options, this.#scopeName)
            return scoped
          },
          enumerable: true,
          configurable: true
        })
      }
    }
    this.#selection = selection
  }

  #source(field: RelationField): HasSql {
    const data = getField(field)
    return data.targetName === this.#sourceName
      ? new Field(this.#sourceScope, data.fieldName, data.source)
      : field
  }

  #correlated(query: ORMQuery, select: SelectionInput) {
    const {joins, ...selection} = query
    this.#invocationId += 1
    const {options} = getRelation(this)
    const name = options.alias
      ? this.#invocationId === 1
        ? options.alias
        : `${options.alias}_${this.#invocationId}`
      : relationAlias()
    const relationTarget = alias(this.#relationTable, name)
    const through = options.through
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
      from = queryFrom(relationTarget, [
        {
          innerJoin: throughTarget,
          on: and(
            ...this.#targetPairs.map(([to], index) =>
              eq(
                relationTarget[modelFieldKey(this.#relationTable, to)],
                throughTo[index]
              )
            )
          )
        },
        ...(joins ?? [])
      ])
      relationWhere = and(
        ...this.#sourcePairs!.map(([outer], index) =>
          eq(throughFrom[index], this.#source(outer))
        )
      )
    } else {
      from = queryFrom(relationTarget, joins)
      relationWhere = and(
        ...this.#targetPairs.map(([to, outer]) =>
          eq(
            relationTarget[modelFieldKey(this.#relationTable, to)],
            this.#source(outer)
          )
        )
      )
    }
    const data = {
      ...selection,
      from,
      select,
      where: and(
        relationWhere,
        options.where &&
          getSql(options.where).scopeTarget(this.#targetName, this.#scopeName),
        selection.where
      )
    }
    const targetScope = {
      sourceName: this.#scopeName,
      name
    }
    return {data, targetScope}
  }

  #load(input?: RelationInput) {
    const query = input ?? {}
    const {data, targetScope} = this.#correlated(
      query,
      query.select ?? this.#selection
    )
    const scoped = new Select(data)
    return this.#include(scoped, targetScope)
  }

  #predicate(
    input: RelationPredicateQuery | HasSql<boolean> | undefined,
    options: {negateExists?: boolean; negateWhere?: boolean} = {}
  ): Sql<boolean> {
    const query: RelationPredicateQuery = !input
      ? {}
      : hasSql(input)
        ? {where: input}
        : input
    const where = options.negateWhere ? not(query.where ?? and()) : query.where
    const {data, targetScope} = this.#correlated({...query, where}, sql`1`)
    const condition = existsExpr(new Select(data)).scopeTarget(
      targetScope.sourceName,
      targetScope.name
    )
    return options.negateExists ? not(condition) : condition
  }
}

export class OneRelation<
  Target extends HasTable,
  FromName extends string,
  Required extends boolean = false
> extends Relation<Target, FromName, RelationOptions<FromName, Required>> {
  constructor(
    target: Target,
    options: RelationOptions<FromName, Required>,
    sourceScope?: string
  ) {
    super(target, options, include.one, sourceScope)
  }
}

export class ManyRelation<
  Target extends HasTable,
  FromName extends string
> extends Relation<Target, FromName, ManyRelationOptions<FromName>> {
  constructor(
    target: Target,
    options: ManyRelationOptions<FromName>,
    sourceScope?: string
  ) {
    super(target, options, include, sourceScope)
  }
}

export function one<
  Target extends HasTable,
  FromName extends string,
  Required extends boolean = false
>(
  target: Target,
  options: RelationOptions<FromName, Required>
): OneRelation<Target, FromName, Required> & RelationModel<Target> {
  return new OneRelation(target, options) as OneRelation<
    Target,
    FromName,
    Required
  > &
    RelationModel<Target>
}

export function many<Target extends HasTable, FromName extends string>(
  target: Target,
  options: ManyRelationOptions<FromName>
): ManyRelation<Target, FromName> & RelationModel<Target> {
  return new ManyRelation(target, options) as ManyRelation<Target, FromName> &
    RelationModel<Target>
}

export function some<Target extends HasTable, FromName extends string>(
  relation: ManyRelation<Target, FromName>,
  input?: RelationPredicateQuery | HasSql<boolean>
): Sql<boolean> {
  return getRelation(relation).predicate(input)
}

export function none<Target extends HasTable, FromName extends string>(
  relation: ManyRelation<Target, FromName>,
  input?: RelationPredicateQuery | HasSql<boolean>
): Sql<boolean> {
  return getRelation(relation).predicate(input, {negateExists: true})
}

export function every<Target extends HasTable, FromName extends string>(
  relation: ManyRelation<Target, FromName>,
  input?: RelationPredicateQuery | HasSql<boolean>
): Sql<boolean> {
  return getRelation(relation).predicate(input, {
    negateExists: true,
    negateWhere: true
  })
}

export function is<
  Target extends HasTable,
  FromName extends string,
  Required extends boolean
>(
  relation: OneRelation<Target, FromName, Required>,
  input?: RelationPredicateQuery | HasSql<boolean>
): Sql<boolean> {
  return getRelation(relation).predicate(input)
}

export function isNot<
  Target extends HasTable,
  FromName extends string,
  Required extends boolean
>(
  relation: OneRelation<Target, FromName, Required>,
  input?: RelationPredicateQuery | HasSql<boolean>
): Sql<boolean> {
  return getRelation(relation).predicate(input, {negateExists: true})
}

type ModelRelation<Model extends object> = {
  [Key in keyof Model]: Model[Key] extends WriteRelation ? Model[Key] : never
}[keyof Model]

type RelationTarget<Relation> =
  Relation extends RelationDescriptor<infer Target> ? Target : never

type RelationInsert<Relation> = TableInsert<
  ModelDefinition<RelationTarget<Relation>>
>

type RelationUpdate<Relation> = TableUpdate<
  ModelDefinition<RelationTarget<Relation>>
>

type WriteRelation = RelationDescriptor<HasTable>

interface WriteOperation<Relation = WriteRelationPlan> {
  type: 'insert' | 'update' | 'delete' | 'connect' | 'disconnect'
  action: typeof writeRootAction
  prepare?: typeof prepareOneWrite
  relation?: Relation
  where?: HasSql<boolean>
  values?: Array<Record<string, unknown>>
  set?: Record<string, unknown>
}

interface WriteSegment {
  model: HasTable
  anchor:
    | {type: 'insert'; values: Array<Record<string, unknown>>}
    | {type: 'where'; where: HasSql<boolean>}
  operations: Array<WriteOperation>
}

interface WriteContext<Meta extends QueryMeta> {
  tx: Transaction<Meta>
  segment: WriteSegment
  table: Table<TableDefinition>
  rows: Array<Record<string, unknown>>
  returning?: SelectionInput
}

interface WriteRelationPlan {
  descriptor: WriteRelation
  data: RelationData<HasTable>
  target: Table<TableDefinition>
  from: Array<string>
  to: Array<string>
  through?: {
    table: Table<TableDefinition>
    from: Array<string>
    to: Array<string>
  }
}

interface WriteReturningResult {
  row: Record<string, unknown>
  result: unknown
}

function writeRelationPlan(
  model: HasTable,
  descriptor: WriteRelation
): WriteRelationPlan {
  const data = getRelation(descriptor)
  const keys = (target: HasTable, fields: RelationFields) =>
    relationFields(fields).map(field => modelFieldKey(target, field))
  const through = data.options.through
  return {
    descriptor,
    data,
    target: data.target as Table<TableDefinition>,
    from: keys(model, data.options.from),
    to: keys(data.target, data.options.to),
    through: through && {
      table: through.table as Table<TableDefinition>,
      from: keys(through.table, through.from),
      to: keys(through.table, through.to)
    }
  }
}

function copyWriteFields(
  target: Record<string, unknown>,
  targetKeys: Array<string>,
  source: Record<string, unknown>,
  sourceKeys: Array<string>
) {
  for (let index = 0; index < targetKeys.length; index++)
    target[targetKeys[index]!] = source[sourceKeys[index]!]
}

function writeJoinRows(
  relation: WriteRelationPlan,
  parents: Array<Record<string, unknown>>,
  related: Array<Record<string, unknown>>
) {
  const {through, from, to} = relation
  return parents.flatMap(parent =>
    related.map(row => {
      const join: Record<string, unknown> = {}
      copyWriteFields(join, through!.from, parent, from)
      copyWriteFields(join, through!.to, row, to)
      return join
    })
  )
}

function writeRowsWhere(
  model: HasTable,
  keys: Array<string>,
  rows: Array<Record<string, unknown>>,
  sourceKeys = keys
): HasSql<boolean> | undefined {
  if (rows.length === 0) return
  const fields = model as unknown as Record<string, HasSql>
  return or(
    ...rows.map(row =>
      and(...keys.map((key, index) => eq(fields[key], row[sourceKeys[index]!])))
    )
  )
}

function writeTargetWhere(relation: WriteRelationPlan, where: HasSql<boolean>) {
  return and(
    relation.data.options.where,
    getSql(where).scopeTarget(
      relation.data.scope,
      getTable(relation.target).aliased
    )
  )
}

function* insertWriteRow<Meta extends QueryMeta>(
  tx: Transaction<Meta>,
  model: HasTable,
  value: Record<string, unknown>,
  required: Array<string>
): Generator<Promise<unknown>, Record<string, unknown>, unknown> {
  const target = model as Table<TableDefinition>
  const insert = {
    insert: target,
    values: value as TableInsert<TableDefinition>
  }
  const inserted = {...value}
  if (
    tx.dialect.runtime === 'mysql' &&
    required.some(key => inserted[key] === undefined)
  )
    throw new Error(
      `write() requires explicit relation fields for ${getTable(model).name} on mysql`
    )
  if (tx.dialect.runtime === 'mysql') {
    yield* tx.$query(insert)
    return inserted
  }
  const returned = (yield* tx.$query({
    ...insert,
    returning: target
  })) as unknown as Array<Record<string, unknown>>
  if (!returned[0]) throw new Error('write() did not return the inserted row')
  return returned[0]
}

function* resolveOneWrite<Meta extends QueryMeta>(
  tx: Transaction<Meta>,
  relation: WriteRelationPlan,
  operation: WriteOperation
): Generator<Promise<unknown>, Record<string, unknown>, unknown> {
  if (operation.type === 'insert') {
    if (operation.values!.length !== 1)
      throw new Error('One relation insert expects one value')
    return yield* insertWriteRow(
      tx,
      relation.data.target,
      operation.values![0]!,
      relation.to
    )
  }
  const matches = (yield* tx.$query({
    select: relation.target,
    from: relation.target,
    where: writeTargetWhere(relation, operation.where!)
  })) as unknown as Array<Record<string, unknown>>
  if (matches.length !== 1)
    throw new Error('One relation connect expects one matching row')
  return matches[0]!
}

function* relationWriteWhere<Meta extends QueryMeta>(
  tx: Transaction<Meta>,
  relation: WriteRelationPlan,
  parents: Array<Record<string, unknown>>,
  where: HasSql<boolean>
): Generator<Promise<unknown>, HasSql<boolean> | undefined, unknown> {
  const {target, from, to, through} = relation
  let related = writeRowsWhere(target, to, parents, from)
  if (through) {
    const joins = (yield* tx.$query({
      select: through.table,
      from: through.table,
      where: writeRowsWhere(through.table, through.from, parents, from)
    })) as unknown as Array<Record<string, unknown>>
    related = writeRowsWhere(target, to, joins, through.to)
  }
  return related && and(related, writeTargetWhere(relation, where))
}

function* prepareOneWrite<Meta extends QueryMeta>(
  tx: Transaction<Meta>,
  values: Array<Record<string, unknown>>,
  operation: WriteOperation
): Generator<Promise<unknown>, boolean, unknown> {
  const relation = operation.relation
  if (
    !relation ||
    !(relation.descriptor instanceof OneRelation) ||
    (operation.type !== 'insert' && operation.type !== 'connect')
  )
    return false
  const related = yield* resolveOneWrite(tx, relation, operation)
  for (const value of values)
    copyWriteFields(value, relation.from, related, relation.to)
  return true
}

function* writeRootAction<Meta extends QueryMeta>(
  context: WriteContext<Meta>,
  operation: WriteOperation
): Generator<Promise<unknown>, Array<unknown> | undefined, unknown> {
  const {tx, segment, table, returning} = context
  if (segment.anchor.type === 'insert') return
  if (returning) {
    const data = {
      where: segment.anchor.where,
      returning: {row: table, result: returning}
    }
    const returned = (yield* operation.type === 'update'
      ? tx.$query({
          ...data,
          update: table,
          set: operation.set as TableUpdate<TableDefinition>
        })
      : tx.$query({
          ...data,
          delete: table
        })) as unknown as Array<WriteReturningResult>
    context.rows = returned.map(value => value.row)
    return returned.map(value => value.result)
  }
  if (operation.type === 'update') {
    yield* tx.$query({
      update: table,
      set: operation.set as TableUpdate<TableDefinition>,
      where: segment.anchor.where
    })
    for (const row of context.rows) Object.assign(row, operation.set)
  } else {
    yield* tx.$query({delete: table, where: segment.anchor.where})
  }
}

function* writeRelationCreate<Meta extends QueryMeta>(
  context: WriteContext<Meta>,
  operation: WriteOperation
): Generator<Promise<unknown>, undefined, unknown> {
  const {tx, segment, table, rows} = context
  const relation = operation.relation!
  const {target, from, to, through} = relation

  if (relation.descriptor instanceof OneRelation) {
    if (segment.anchor.type !== 'where')
      throw new Error(
        `One relation ${operation.type} requires an existing scope`
      )
    const related = yield* resolveOneWrite(tx, relation, operation)
    const set: Record<string, unknown> = {}
    copyWriteFields(set, from, related, to)
    yield* tx.$query({
      update: table,
      set: set as TableUpdate<TableDefinition>,
      where: segment.anchor.where
    })
    for (const row of rows) Object.assign(row, set)
    return
  }

  if (operation.type === 'insert') {
    if (!through) {
      for (const row of rows)
        for (const value of operation.values!) {
          const child = {...value}
          copyWriteFields(child, to, row, from)
          yield* insertWriteRow(tx, target, child, [])
        }
    } else {
      const related = []
      for (const value of operation.values!)
        related.push(yield* insertWriteRow(tx, target, value, to))
      for (const join of writeJoinRows(relation, rows, related))
        yield* insertWriteRow(tx, through.table, join, [])
    }
    return
  }

  const targetWhere = writeTargetWhere(relation, operation.where!)
  if (!through) {
    if (rows.length !== 1)
      throw new Error(
        'Direct many relation connect expects one matching parent'
      )
    const set: Record<string, unknown> = {}
    copyWriteFields(set, to, rows[0]!, from)
    yield* tx.$query({
      update: target,
      set: set as TableUpdate<TableDefinition>,
      where: targetWhere
    })
    return
  }
  const matches = (yield* tx.$query({
    select: target,
    from: target,
    where: targetWhere
  })) as unknown as Array<Record<string, unknown>>
  const keys = [...through.from, ...through.to]
  for (const join of writeJoinRows(relation, rows, matches)) {
    const existing = (yield* tx.$query({
      select: sql`1`,
      from: through.table,
      where: writeRowsWhere(through.table, keys, [join]),
      limit: 1
    })) as unknown as Array<unknown>
    if (existing.length === 0)
      yield* insertWriteRow(tx, through.table, join, [])
  }
}

function* writeRelationChange<Meta extends QueryMeta>(
  context: WriteContext<Meta>,
  operation: WriteOperation
): Generator<Promise<unknown>, undefined, unknown> {
  const {tx, segment, table, rows} = context
  const relation = operation.relation!
  const {data, target, from, to, through} = relation
  const scoped = yield* relationWriteWhere(tx, relation, rows, operation.where!)
  if (!scoped) return
  if (operation.type === 'update') {
    yield* tx.$query({
      update: target,
      set: operation.set as TableUpdate<TableDefinition>,
      where: scoped
    })
    return
  }
  if (relation.descriptor instanceof OneRelation) {
    if (data.options.required)
      throw new Error('Required relation cannot be deleted or disconnected')
    if (segment.anchor.type !== 'where')
      throw new Error(
        'One relation delete or disconnect requires an existing scope'
      )
    const matches = (yield* tx.$query({
      select: target,
      from: target,
      where: scoped
    })) as unknown as Array<Record<string, unknown>>
    const parentWhere = writeRowsWhere(segment.model, from, matches, to)
    if (!parentWhere) return
    const set = Object.fromEntries(from.map(key => [key, null]))
    yield* tx.$query({
      update: table,
      set: set as TableUpdate<TableDefinition>,
      where: and(segment.anchor.where, parentWhere)
    })
    if (operation.type === 'disconnect') return
  }
  if (!through) {
    if (operation.type === 'delete') {
      yield* tx.$query({delete: target, where: scoped})
      return
    }
    const set = Object.fromEntries(to.map(key => [key, null]))
    yield* tx.$query({
      update: target,
      set: set as TableUpdate<TableDefinition>,
      where: scoped
    })
    return
  }
  const matches = (yield* tx.$query({
    select: target,
    from: target,
    where: scoped
  })) as unknown as Array<Record<string, unknown>>
  const joins = writeJoinRows(relation, rows, matches)
  const joinWhere =
    operation.type === 'delete'
      ? writeRowsWhere(through.table, through.to, matches, to)
      : writeRowsWhere(through.table, [...through.from, ...through.to], joins)
  if (joinWhere) yield* tx.$query({delete: through.table, where: joinWhere})
  if (operation.type === 'delete')
    yield* tx.$query({delete: target, where: scoped})
}

function executeWrite<Meta extends QueryMeta>(
  orm: ORM<Meta>,
  segments: Array<WriteSegment>,
  returning?: SelectionInput
): Deliver<Meta, void | Array<unknown>> {
  const execute = txGenerator<void | Array<unknown>, Meta>(function* (tx) {
    let result: void | Array<unknown> = undefined
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!
      const table = segment.model as Table<TableDefinition>
      const returns = returning !== undefined && index === segments.length - 1
      const skipped = new Set<WriteOperation>()
      let rows: Array<Record<string, unknown>>

      if (segment.anchor.type === 'insert') {
        const values = segment.anchor.values.map(value => ({...value}))
        for (const operation of segment.operations) {
          if (
            operation.prepare &&
            (yield* operation.prepare(tx, values, operation))
          )
            skipped.add(operation)
        }
        const required = segment.operations.flatMap(
          operation => operation.relation?.from ?? []
        )
        rows = []
        if (returns) {
          const inserted = values.length
            ? ((yield* tx.$query({
                insert: table,
                values: values as Array<TableInsert<TableDefinition>>,
                returning: {row: table, result: returning}
              })) as unknown as Array<WriteReturningResult>)
            : []
          rows = inserted.map(value => value.row)
          result = inserted.map(value => value.result)
        } else {
          for (const value of values)
            rows.push(yield* insertWriteRow(tx, segment.model, value, required))
        }
      } else {
        rows = segment.operations.some(operation => operation.relation)
          ? ((yield* tx.$query({
              select: table,
              from: table,
              where: segment.anchor.where
            })) as unknown as Array<Record<string, unknown>>)
          : []
      }

      const context: WriteContext<Meta> = {
        tx,
        segment,
        table,
        rows,
        returning: returns ? returning : undefined
      }
      for (const operation of segment.operations) {
        if (skipped.has(operation)) continue
        const returned = yield* operation.action(context, operation)
        if (returned !== undefined) result = returned
      }
    }
    return result
  })
  return (
    orm.driver.supportsTransactions
      ? orm.transaction(execute)
      : execute(orm as unknown as Transaction<Meta>)
  ) as Deliver<Meta, void | Array<unknown>>
}

export class ModelWriteStart<Model extends HasTable, Meta extends QueryMeta> {
  readonly #orm: ORM<Meta>
  readonly #segments: Array<WriteSegment>
  readonly #model: Model

  constructor(orm: ORM<Meta>, segments: Array<WriteSegment>, model: Model) {
    this.#orm = orm
    this.#segments = segments
    this.#model = model
  }

  insert(
    values:
      | TableInsert<ModelDefinition<Model>>
      | Array<TableInsert<ModelDefinition<Model>>>
  ): ModelWrite<Model, Meta, true> {
    return new ModelWrite<Model, Meta, true>(this.#orm, [
      ...this.#segments,
      {
        model: this.#model,
        anchor: {
          type: 'insert',
          values: (Array.isArray(values) ? values : [values]) as Array<
            Record<string, unknown>
          >
        },
        operations: []
      }
    ])
  }

  where(where: HasSql<boolean>): ModelWrite<Model, Meta, false> {
    return new ModelWrite<Model, Meta, false>(this.#orm, [
      ...this.#segments,
      {
        model: this.#model,
        anchor: {type: 'where', where},
        operations: []
      }
    ])
  }
}

export class ModelWrite<
  Model extends HasTable,
  Meta extends QueryMeta,
  RootMutation extends boolean = boolean
> extends Executable<void, Meta> {
  declare readonly [internalRootMutation]: RootMutation
  readonly #orm: ORM<Meta>
  readonly #segments: Array<WriteSegment>

  constructor(orm: ORM<Meta>, segments: Array<WriteSegment>) {
    super(() => executeWrite(orm, segments) as Deliver<Meta, void>)
    this.#orm = orm
    this.#segments = segments
  }

  #append<NextRootMutation extends boolean = RootMutation>(
    operation: Omit<WriteOperation<WriteRelation>, 'action' | 'prepare'>
  ): ModelWrite<Model, Meta, NextRootMutation> {
    const current = this.#segments.at(-1)!
    const relation =
      operation.relation && writeRelationPlan(current.model, operation.relation)
    const creates = operation.type === 'insert' || operation.type === 'connect'
    const action = !relation
      ? writeRootAction
      : creates
        ? writeRelationCreate
        : writeRelationChange
    const planned = {
      ...operation,
      action,
      relation,
      prepare: relation && creates ? prepareOneWrite : undefined
    }
    return new ModelWrite<Model, Meta, NextRootMutation>(this.#orm, [
      ...this.#segments.slice(0, -1),
      {
        ...current,
        operations: [...current.operations, planned]
      }
    ])
  }

  update(
    this: ModelWrite<Model, Meta, false>,
    values: TableUpdate<ModelDefinition<Model>>
  ): ModelWrite<Model, Meta, true>
  update<Relation extends ModelRelation<Model>>(
    relation: Relation,
    where: HasSql<boolean>,
    values: RelationUpdate<Relation>
  ): ModelWrite<Model, Meta, RootMutation>
  update(
    relationOrValues: WriteRelation | Record<string, unknown>,
    where?: HasSql<boolean>,
    values?: Record<string, unknown>
  ): ModelWrite<Model, Meta, boolean> {
    if (typeof relationOrValues === 'function' && hasRelation(relationOrValues))
      return this.#append({
        type: 'update',
        relation: relationOrValues,
        where,
        set: values
      })
    return this.#append<true>({
      type: 'update',
      set: relationOrValues as Record<string, unknown>
    })
  }

  insert<Relation extends ModelRelation<Model>>(
    relation: Relation,
    values: RelationInsert<Relation> | Array<RelationInsert<Relation>>
  ): ModelWrite<Model, Meta, RootMutation> {
    return this.#append({
      type: 'insert',
      relation,
      values: (Array.isArray(values) ? values : [values]) as Array<
        Record<string, unknown>
      >
    })
  }

  delete(this: ModelWrite<Model, Meta, false>): ModelWrite<Model, Meta, true>
  delete<Relation extends ModelRelation<Model>>(
    relation: Relation,
    where: HasSql<boolean>
  ): ModelWrite<Model, Meta, RootMutation>
  delete(
    relation?: WriteRelation,
    where?: HasSql<boolean>
  ): ModelWrite<Model, Meta, boolean> {
    return relation
      ? this.#append({type: 'delete', relation, where})
      : this.#append<true>({type: 'delete'})
  }

  connect<Relation extends ModelRelation<Model>>(
    relation: Relation,
    where: HasSql<boolean>
  ): ModelWrite<Model, Meta, RootMutation> {
    return this.#append({
      type: 'connect',
      relation,
      where
    })
  }

  disconnect<Relation extends ModelRelation<Model>>(
    relation: Relation,
    where: HasSql<boolean>
  ): ModelWrite<Model, Meta, RootMutation> {
    return this.#append({
      type: 'disconnect',
      relation,
      where
    })
  }

  write<Next extends HasTable>(model: Next): ModelWriteStart<Next, Meta> {
    return new ModelWriteStart(this.#orm, this.#segments, model)
  }

  returning(
    this: ModelWrite<Model, IsPostgres | IsSqlite, true>
  ): Executable<Array<ModelRow<Model>>, Meta>
  returning<Returning extends SelectionInput>(
    this: ModelWrite<Model, IsPostgres | IsSqlite, true>,
    selection: Returning
  ): Executable<Array<SelectionRow<Returning>>, Meta>
  returning(
    selection: SelectionInput = this.#segments.at(-1)!.model
  ): Executable<Array<unknown>, Meta> {
    return new Executable(
      () =>
        executeWrite(this.#orm, this.#segments, selection) as Deliver<
          Meta,
          Array<unknown>
        >
    )
  }
}
