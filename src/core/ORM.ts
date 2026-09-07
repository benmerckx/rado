import {txGenerator} from '../universal/transactions.ts'
import {Callable} from '../util/Callable.ts'
import {Builder} from './Builder.ts'
import type {Transaction} from './Database.ts'
import type {Dialect} from './Dialect.ts'
import type {Driver} from './Driver.ts'
import {count as aggregateCount} from './expr/Aggregate.ts'
import {and, eq, exists, not, or, when} from './expr/Conditions.ts'
import {Field, type FieldData} from './expr/Field.ts'
import {Include, type IncludeQuery} from './expr/Include.ts'
import {mapToColumn} from './expr/Input.ts'
import {
  type HasRelation,
  type HasSql,
  type HasTable,
  type HasTarget,
  getData,
  getField,
  getRelation,
  getSql,
  getTable,
  hasRelation,
  hasSql,
  internalRelation,
  internalData
} from './Internal.ts'
import type {Deliver, QueryMeta} from './MetaData.ts'
import {Executable, type SingleQuery} from './Queries.ts'
import type {
  DeleteQuery,
  InsertQuery,
  Join,
  SelectQuery,
  UpdateQuery
} from './query/Query.ts'
import {Select, SelectFirst, selectQuery} from './query/Select.ts'
import {
  type SelectionInput,
  type SelectionRow,
  selectionEntries
} from './Selection.ts'
import {type Sql, type TargetScope, sql} from './Sql.ts'
import {alias, type Table, type TableInsert, type TableUpdate} from './Table.ts'

type ModelSelection<M> = {
  [K in keyof M as K extends string
    ? M[K] extends Function
      ? never
      : K
    : never]: Extract<M[K], SelectionInput>
}
type InsertRow<M> = M extends HasTable<infer D> ? TableInsert<D> : never
type UpdateRow<M> = M extends HasTable<infer D> ? TableUpdate<D> : never
export type ORMQuery<S extends SelectionInput = SelectionInput> = Omit<
  SelectQuery<S>,
  'from' | 'select'
> & {
  select?: S
  joins?: Array<Join>
}
export type RelationFields<FromName extends string = string> =
  | Field<unknown, FromName>
  | readonly Field<unknown, FromName>[]
export interface RelationOptions<
  FromName extends string = string,
  Required extends boolean = false
> {
  from: RelationFields<FromName>
  to: RelationFields
  alias?: string
  where?: HasSql<boolean>
  required?: Required
}
export interface RelationThrough {
  table: HasTable
  from: RelationFields
  to: RelationFields
}
export interface ManyRelationOptions<
  FromName extends string = string
> extends Omit<RelationOptions<FromName>, 'required'> {
  through?: RelationThrough
}
type OneOptions = RelationOptions<string, boolean>
type Cardinality = 'one' | 'many'
type RelationResult<K, R, S> = K extends 'many'
  ? Array<SelectionRow<S>>
  : SelectionRow<S> | (R extends true ? never : null)
type Relation<
  M extends HasTable = HasTable,
  K extends Cardinality = Cardinality,
  R extends boolean = boolean,
  FromName extends string = string
> = M &
  HasRelation<RelationApi> & {
    <S extends SelectionInput = ModelSelection<M>>(
      options?: ORMQuery<S>
    ): Include<RelationResult<K, R, S>>
    readonly [relationType]: [M, K, R, FromName]
  }
declare const relationType: unique symbol
type Many<M extends HasTable = HasTable> = Relation<M, 'many'>
type One<M extends HasTable = HasTable, R extends boolean = boolean> = Relation<
  M,
  'one',
  R
>

let relationId = 0
const fields = (value: RelationFields): Array<FieldData> =>
  (Array.isArray(value) ? value : [value]).map(getField)
const field = (data: FieldData, targetName = data.targetName) =>
  new Field(targetName, data.fieldName, data.source, data.key)
const defaults = (model: HasTarget): SelectionInput =>
  Object.fromEntries(selectionEntries(model))

type RelationFactory = (
  sourceScope: string,
  alias: string
) => Callable & HasRelation<RelationApi>

class RelationApi {
  readonly model: HasTable
  readonly target: Table
  readonly from: Array<FieldData>
  readonly to: Array<FieldData>
  readonly through?: {
    table: HasTable
    from: Array<FieldData>
    to: Array<FieldData>
  }
  readonly required: boolean
  readonly where?: HasSql<boolean>
  readonly load: (query: IncludeQuery, scope?: TargetScope) => Include<unknown>
  readonly owns: (kind: RelationWrite['kind']) => boolean
  readonly #rebind: RelationFactory

  constructor(
    model: HasTable,
    options: ManyRelationOptions & OneOptions,
    load: RelationApi['load'],
    owns: RelationApi['owns'],
    rebind: RelationFactory,
    sourceScope?: string
  ) {
    this.model = model
    this.target = alias(
      model as Table,
      options.alias ?? `__relation_${++relationId}`
    )
    this.from = fields(options.from).map(field =>
      sourceScope ? {...field, targetName: sourceScope} : field
    )
    this.to = fields(options.to)
    this.through = options.through && {
      table: options.through.table,
      from: fields(options.through.from),
      to: fields(options.through.to)
    }
    this.required = !!options.required
    this.where = options.where
    this.load = load
    this.owns = owns
    this.#rebind = rebind
    for (const [from, to] of this.through
      ? [
          [this.from, this.through.from],
          [this.to, this.through.to]
        ]
      : [[this.from, this.to]])
      if (!from!.length || from!.length !== to!.length)
        throw new Error(
          'Relation field mappings must have equal, nonzero lengths'
        )
  }

  rebind(sourceScope: string): Callable & HasRelation<RelationApi> {
    return this.#rebind(sourceScope, getTable(this.target).aliased)
  }

  get scope(): TargetScope | undefined {
    return this.from.some(
      field => field.targetName === getTable(this.model).aliased
    )
      ? undefined
      : {
          sourceName: getTable(this.model).aliased,
          name: getTable(this.target).aliased
        }
  }

  query(options: ORMQuery = {}): SelectQuery {
    const {joins = [], select = defaults(this.target), ...rest} = options
    const targetName = getTable(this.target).aliased
    const originalName = getTable(this.model).aliased
    const target = (f: FieldData) => field(f, targetName)
    const through = this.through
    const correlation = and(
      ...this.from.map((from, i) =>
        eq(field(from), through ? field(through.from[i]!) : target(this.to[i]!))
      )
    )
    return {
      ...rest,
      select,
      from: [
        this.target,
        ...(through
          ? [
              {
                innerJoin: through.table,
                on: and(
                  ...this.to.map((to, i) =>
                    eq(target(to), field(through.to[i]!))
                  )
                )
              }
            ]
          : []),
        ...joins
      ],
      where: and(
        correlation,
        this.where && getSql(this.where).scopeTarget(originalName, targetName),
        options.where
      )
    }
  }

  exists(
    predicate?: RelationPredicateQueryInput,
    invert = false
  ): Sql<boolean> {
    const options =
      predicate && hasSql(predicate) ? {where: predicate} : (predicate ?? {})
    const query = this.query({
      ...options,
      select: sql`1`,
      where: invert ? not(options.where ?? sql<boolean>`true`) : options.where
    })
    const result = exists(selectQuery(query))
    const scope = this.scope
    return scope ? result.scopeTarget(scope.sourceName, scope.name) : result
  }

  filter(where?: HasSql<boolean>): Sql<boolean> {
    return and(this.where, where).scopeTarget(
      getTable(this.target).aliased,
      getTable(this.model).aliased
    )
  }
}

abstract class RelationDescriptor<
  Target extends HasTable,
  FromName extends string,
  K extends Cardinality,
  R extends boolean
> extends Callable {
  readonly [internalRelation]: RelationApi
  declare readonly [relationType]: [Target, K, R, FromName]

  constructor(data: RelationApi) {
    super((options: ORMQuery = {}) =>
      data.load({...data.query(options), first: false}, data.scope)
    )
    this[internalRelation] = data
    for (const [key, value] of Object.entries(data.model)) {
      const exposed =
        typeof value === 'function' && hasRelation<RelationApi>(value)
          ? getRelation(value).rebind(getTable(data.target).aliased)
          : (data.target as unknown as Record<string, unknown>)[key]
      Object.defineProperty(this, key, {
        value: exposed,
        enumerable: true,
        configurable: true
      })
    }
  }
}
interface RelationDescriptor<
  Target extends HasTable,
  FromName extends string,
  K extends Cardinality,
  R extends boolean
> {
  <S extends SelectionInput = ModelSelection<Target>>(
    options?: ORMQuery<S>
  ): Include<RelationResult<K, R, S>>
}
export class OneRelation<
  Target extends HasTable,
  FromName extends string,
  Required extends boolean = false
> extends RelationDescriptor<Target, FromName, 'one', Required> {
  constructor(
    target: Target,
    options: RelationOptions<FromName, Required>,
    sourceScope?: string
  ) {
    super(
      new RelationApi(
        target,
        options,
        (query, scope) => new Include({...query, first: true}, scope),
        kind => kind !== 'update',
        (scope, alias) => new OneRelation(target, {...options, alias}, scope),
        sourceScope
      )
    )
  }
}
export class ManyRelation<
  Target extends HasTable,
  FromName extends string
> extends RelationDescriptor<Target, FromName, 'many', boolean> {
  constructor(
    target: Target,
    options: ManyRelationOptions<FromName>,
    sourceScope?: string
  ) {
    super(
      new RelationApi(
        target,
        options,
        (query, scope) => new Include({...query, first: false}, scope),
        () => false,
        (scope, alias) => new ManyRelation(target, {...options, alias}, scope),
        sourceScope
      )
    )
  }
}
export function many<M extends HasTable, N extends string>(
  model: M,
  options: ManyRelationOptions<N>
): M & ManyRelation<M, N> {
  return new ManyRelation(model, options) as M & ManyRelation<M, N>
}
export function one<
  M extends HasTable,
  N extends string,
  R extends boolean = false
>(model: M, options: RelationOptions<N, R>): M & OneRelation<M, N, R> {
  return new OneRelation(model, options) as M & OneRelation<M, N, R>
}
export interface RelationPredicateQuery {
  where?: HasSql<boolean>
  joins?: Array<Join>
}
type RelationPredicateQueryInput = HasSql<boolean> | RelationPredicateQuery
export const some = (
  relation: Many,
  predicate?: RelationPredicateQueryInput
): Sql<boolean> => getRelation(relation).exists(predicate)
export const none = (
  relation: Many,
  predicate?: RelationPredicateQueryInput
): Sql<boolean> => not(some(relation, predicate))
export const every = (
  relation: Many,
  predicate?: RelationPredicateQueryInput
): Sql<boolean> => not(getRelation(relation).exists(predicate, true))
export const is = (
  relation: One,
  predicate?: RelationPredicateQueryInput
): Sql<boolean> => getRelation(relation).exists(predicate)
export const isNot = (
  relation: One,
  predicate?: RelationPredicateQueryInput
): Sql<boolean> => not(is(relation, predicate))

export abstract class ORM<Meta extends QueryMeta> extends Builder<Meta> {
  abstract driver: Driver
  abstract dialect: Dialect
  abstract transaction<Result>(
    callback: (tx: Transaction<Meta>) => Result | Promise<Result>
  ): Deliver<Meta, Result>

  find<M extends HasTarget, S extends SelectionInput = ModelSelection<M>>(
    model: M,
    options: ORMQuery<S> = {}
  ): Select<S, Meta> {
    const {joins = [], select = defaults(model), ...rest} = options
    return new Select({
      ...getData(this),
      ...rest,
      select,
      from: [model, ...joins]
    } as SelectQuery)
  }
  first<M extends HasTarget, S extends SelectionInput = ModelSelection<M>>(
    model: M,
    options: ORMQuery<S> = {}
  ): SelectFirst<S, Meta, true> {
    return new SelectFirst({...getData(this.find(model, options)), limit: 1})
  }

  count(
    model: HasTarget,
    options: Omit<ORMQuery, 'select'> = {}
  ): SelectFirst<Sql<number>, Meta> {
    return new SelectFirst(
      getData(this.find(model, {...options, select: aggregateCount()}))
    )
  }
  write<M extends HasTable>(model: M): ModelWriteStart<M, Meta> {
    return new ModelWriteStart({orm: this, model})
  }
}

type Row = Record<string, unknown>
type Values<M> = InsertRow<M> | Array<InsertRow<M>>
type RelationModel<R> = R extends Relation<infer M> ? M : never
type ModelRelations<M> = Extract<M[keyof M], Relation>
type Phase = 'root' | 'owned' | 'dependent' | 'deleted'
type Allowed<P extends Phase> = P extends 'deleted'
  ? never
  : P extends 'dependent'
    ? Many
    : Relation
type Removable<P extends Phase> = P extends 'deleted'
  ? never
  : P extends 'dependent'
    ? Many
    : Many | One<HasTable, false>
type Next<P extends Phase, R> = R extends Many
  ? 'dependent'
  : P extends 'root'
    ? 'owned'
    : P
type Mutated<B extends boolean, R> = R extends One ? true : B
type Native<Meta extends QueryMeta> = Meta['dialect'] extends
  | 'postgres'
  | 'sqlite'
  ? unknown
  : never

interface WriteStartData<Meta extends QueryMeta> {
  orm: ORM<Meta>
  model: HasTable
  prev?: WriteData<Meta>
}

interface WriteData<Meta extends QueryMeta> extends WriteStartData<Meta> {
  instruction:
    | {values: Array<Row>}
    | {where: HasSql<boolean>}
    | {set: Row}
    | {delete: true}
    | {action: RelationWrite}
}

export class ModelWriteStart<M extends HasTable, Meta extends QueryMeta> {
  readonly [internalData]: WriteStartData<Meta>

  constructor(data: WriteStartData<Meta>) {
    this[internalData] = data
  }

  insert(values: Values<M>): ModelWrite<M, Meta, true> {
    return new ModelWrite({
      ...getData(this),
      instruction: {values: array(values)}
    })
  }

  where(where: HasSql<boolean>): ModelWrite<M, Meta, false> {
    return new ModelWrite({...getData(this), instruction: {where}})
  }
}

class RelationWrite {
  readonly kind: 'insert' | 'update' | 'delete' | 'connect' | 'disconnect'
  readonly relation: RelationApi
  readonly where?: HasSql<boolean>
  readonly values?: Array<Row>

  constructor(
    data: Pick<RelationWrite, 'kind' | 'relation' | 'where' | 'values'>
  ) {
    this.kind = data.kind
    this.relation = data.relation
    this.where = data.where
    this.values = data.values
  }

  get ownsRoot(): boolean {
    return this.relation.owns(this.kind)
  }

  *execute<Meta extends QueryMeta>(
    execution: WriteExecution<Meta>,
    roots: Array<Row>
  ): Generator<Promise<unknown>, void, unknown> {
    if (!roots.length) return
    const {relation: r, kind, values, where} = this
    const filter = r.filter(where)
    const through = r.through
    let scope = through ? sql<boolean>`false` : matches(r.to, roots, r.from)
    if (through && kind !== 'insert' && kind !== 'connect') {
      const links = yield* execution.read(
        through.table,
        matches(through.from, roots, r.from)
      )
      scope = matches(r.to, links, through.to)
    }
    if (kind === 'insert') {
      if (through) {
        const rows = yield* execution.insert(r.model, values!, r.to)
        yield* execution.insert(
          through.table,
          roots.flatMap(root =>
            rows.map(row => ({
              ...assignments(through.from, r.from, root),
              ...assignments(through.to, r.to, row)
            }))
          )
        )
      } else
        yield* execution.insert(
          r.model,
          roots.flatMap(root =>
            values!.map(value => ({
              ...value,
              ...assignments(r.to, r.from, root)
            }))
          )
        )
      return
    }
    if (kind === 'connect') {
      if (through) {
        const targets = yield* execution.read(r.model, filter)
        for (const root of roots)
          for (const target of targets) {
            const value = {
              ...assignments(through.from, r.from, root),
              ...assignments(through.to, r.to, target)
            }
            const existing = yield* execution.read(
              through.table,
              matches([...through.from, ...through.to], [value])
            )
            if (!existing.length)
              yield* execution.insert(through.table, [value])
          }
      } else {
        if (roots.length !== 1)
          throw new Error('Direct many connect requires exactly one parent')
        yield* execution.query({
          update: r.model,
          where: filter,
          set: assignments(r.to, r.from, roots[0]!)
        })
      }
      return
    }
    if (kind === 'update') {
      const set = Object.fromEntries(
        Object.entries(values![0]!).map(([key, value]) => [
          key,
          value && typeof value === 'object' && hasSql(value)
            ? getSql(value).scopeTarget(
                getTable(r.target).aliased,
                getTable(r.model).aliased
              )
            : value
        ])
      )
      yield* execution.query({update: r.model, where: and(scope, filter), set})
      return
    }
    if (through) {
      const targets = yield* execution.read(r.model, and(scope, filter))
      const links = matches(through.to, targets, r.to)
      yield* execution.query({
        delete: through.table,
        where:
          kind === 'delete'
            ? links
            : and(links, matches(through.from, roots, r.from))
      })
    }
    if (kind === 'delete')
      yield* execution.query({delete: r.model, where: and(scope, filter)})
    else if (!through)
      yield* execution.query({
        update: r.model,
        where: and(scope, filter),
        set: Object.fromEntries(r.to.map(f => [f.key, null]))
      })
  }
}

interface Segment {
  model: HasTable
  where?: HasSql<boolean>
  query?: WriteQuery
  actions: Array<RelationWrite>
}
interface Output {
  kind: 'select' | 'returning'
  selection: SelectionInput
}
const array = (values: Row | Array<Row>) =>
  (Array.isArray(values) ? values : [values]).map(row => ({...row}))

export class ModelWrite<
  M extends HasTable,
  Meta extends QueryMeta,
  RootMutation extends boolean = boolean,
  P extends Phase = 'root'
> extends Executable<void, Meta> {
  readonly [internalData]: WriteData<Meta>

  constructor(data: WriteData<Meta>) {
    super(() => this.#execute())
    this[internalData] = data
  }

  #append(instruction: WriteData<Meta>['instruction']): any {
    const prev = getData(this)
    return new ModelWrite({...prev, prev, instruction})
  }

  insert<R extends Allowed<P> & ModelRelations<M>>(
    relation: R,
    values: Values<RelationModel<R>>
  ): ModelWrite<M, Meta, Mutated<RootMutation, R>, Next<P, R>>
  insert(first: Relation, values: Row | Array<Row>): any {
    if (typeof first === 'function' && hasRelation(first))
      return this.#action({
        kind: 'insert',
        relation: getRelation(first),
        values: array(values!)
      })
    throw new Error('An anchored write expects a relation')
  }
  update<R extends ModelRelations<M>>(
    this: P extends 'deleted' ? never : unknown,
    relation: R,
    predicate: HasSql<boolean>,
    values: UpdateRow<RelationModel<R>>
  ): ModelWrite<M, Meta, RootMutation, 'dependent'>
  update(
    this: P extends 'root'
      ? RootMutation extends false
        ? unknown
        : never
      : never,
    values: UpdateRow<M>
  ): ModelWrite<M, Meta, true, 'owned'>
  update(first: Relation | Row, where?: HasSql<boolean>, values?: Row): any {
    if (typeof first === 'function' && hasRelation(first))
      return this.#action({
        kind: 'update',
        relation: getRelation(first),
        where,
        values: [values!]
      })
    if (!('where' in getData(this).instruction))
      throw new Error('Root updates must precede relation operations')
    return this.#append({set: {...first}})
  }
  delete<R extends Removable<P> & ModelRelations<M>>(
    relation: R,
    predicate: HasSql<boolean>
  ): ModelWrite<M, Meta, Mutated<RootMutation, R>, Next<P, R>>
  delete(
    this: P extends 'root'
      ? RootMutation extends false
        ? unknown
        : never
      : never
  ): ModelWrite<M, Meta, true, 'deleted'>
  delete(relation?: Relation, where?: HasSql<boolean>): any {
    if (relation)
      return this.#action({
        kind: 'delete',
        relation: getRelation(relation),
        where
      })
    if (!('where' in getData(this).instruction))
      throw new Error('Root deletion requires a separate segment')
    return this.#append({delete: true})
  }
  connect<R extends Allowed<P> & ModelRelations<M>>(
    relation: R,
    where: HasSql<boolean>
  ): ModelWrite<M, Meta, Mutated<RootMutation, R>, Next<P, R>> {
    return this.#action({
      kind: 'connect',
      relation: getRelation(relation),
      where
    })
  }
  disconnect<R extends Removable<P> & ModelRelations<M>>(
    relation: R,
    where: HasSql<boolean>
  ): ModelWrite<M, Meta, Mutated<RootMutation, R>, Next<P, R>> {
    return this.#action({
      kind: 'disconnect',
      relation: getRelation(relation),
      where
    })
  }

  #action(
    data: Pick<RelationWrite, 'kind' | 'relation' | 'where' | 'values'>
  ): any {
    const action = new RelationWrite(data)
    const current = getData(this)
    const last = current.instruction
    if ('delete' in last || ('where' in last && !last.where))
      throw new Error('Relation writes require an anchored, non-deleted root')
    if (
      action.relation.from.some(
        field => field.targetName !== getTable(current.model).aliased
      )
    )
      throw new Error('Relation does not belong to this root model')
    if (action.ownsRoot) {
      if (action.kind === 'insert' && action.values!.length !== 1)
        throw new Error('One relation insert requires exactly one target')
      if (
        action.relation.required &&
        (action.kind === 'delete' || action.kind === 'disconnect')
      )
        throw new Error(
          'Required one relations cannot be disconnected or deleted'
        )
      const keys = new Set(action.relation.from.map(field => field.key))
      for (
        let node: WriteData<Meta> | undefined = current;
        node;
        node = node.prev
      ) {
        const step = node.instruction
        if ('action' in step) {
          if (!step.action.ownsRoot)
            throw new Error(
              'Root relation changes must precede dependent writes'
            )
          if (step.action.relation.from.some(field => keys.has(field.key)))
            throw new Error('Ambiguous assignment of root relation fields')
        }
        const inputs =
          'values' in step ? step.values : 'set' in step ? [step.set] : []
        if (inputs.some(row => Object.keys(row).some(key => keys.has(key))))
          throw new Error('Ambiguous assignment of root relation fields')
        if ('values' in step || 'where' in step) break
      }
    }
    return this.#append({action})
  }

  write<N extends HasTable>(model: N): ModelWriteStart<N, Meta> {
    const prev = getData(this)
    return new ModelWriteStart({orm: prev.orm, model, prev})
  }
  returning<S extends SelectionInput = ModelSelection<M>>(
    this: Native<Meta> & (RootMutation extends true ? unknown : never),
    selection?: S
  ): Executable<Array<SelectionRow<S>>, Meta>
  returning(
    selection: SelectionInput = defaults(getData(this).model)
  ): Executable<Array<unknown>, Meta> {
    for (
      let node: WriteData<Meta> | undefined = getData(this);
      node;
      node = node.prev
    ) {
      const step = node.instruction
      if ('where' in step) break
      if (!('action' in step) || step.action.ownsRoot)
        return this.#output({kind: 'returning', selection})
    }
    throw new Error('Returning requires a root mutation')
  }
  select<S extends SelectionInput>(
    this: Native<Meta>,
    selection: S
  ): Executable<Array<SelectionRow<S>>, Meta>
  select(selection: SelectionInput): Executable<Array<unknown>, Meta> {
    return this.#output({kind: 'select', selection})
  }

  #output(output: Output): Executable<Array<unknown>, Meta> {
    if (getData(this).orm.dialect.runtime === 'mysql')
      throw new Error('Write output requires native RETURNING')
    return new Executable(() => this.#execute(output))
  }

  #execute(output?: Output) {
    const tail = getData(this)
    const run = txGenerator(function* (tx: Transaction<Meta>) {
      const instructions: Array<WriteData<Meta>> = []
      for (let node: WriteData<Meta> | undefined = tail; node; node = node.prev)
        instructions.push(node)
      const execution = new WriteExecution(tx)
      let segment: Segment | undefined
      for (let index = instructions.length - 1; index >= 0; index--) {
        const {model, instruction} = instructions[index]!
        if ('values' in instruction || 'where' in instruction) {
          if (segment) yield* execution.execute(segment)
          segment = {
            model,
            ...('values' in instruction
              ? {query: {insert: model, values: array(instruction.values)}}
              : instruction),
            actions: []
          }
        } else if ('action' in instruction) {
          segment!.actions.push(instruction.action)
        } else
          segment!.query =
            'set' in instruction
              ? {
                  update: model,
                  set: {...instruction.set},
                  where: segment!.where
                }
              : {delete: model, where: segment!.where}
      }
      const result = yield* execution.execute(segment!, output)
      return output ? result : undefined
    })
    return tail.orm.driver.supportsTransactions
      ? tail.orm.transaction(run)
      : run(tail.orm as Transaction<Meta>)
  }
}

// Query's public overload describes one row, but mutation/select execution returns arrays.
type WriteQuery =
  | (Omit<InsertQuery, 'insert' | 'values'> & {
      insert: HasTable
      values: Array<Row>
    })
  | (Omit<UpdateQuery, 'update' | 'set'> & {update: HasTable; set: Row})
  | (Omit<DeleteQuery, 'delete'> & {delete: HasTable})
function matches(
  fields: Array<FieldData>,
  rows: Array<Row>,
  source = fields
): Sql<boolean> {
  return rows.length
    ? or(
        ...rows.map(row =>
          and(
            ...fields.map((f, i) =>
              row[source[i]!.key] == null
                ? sql<boolean>`false`
                : eq(field(f), row[source[i]!.key])
            )
          )
        )
      )
    : sql`false`
}
function assignments(
  to: Array<FieldData>,
  from: Array<FieldData>,
  row: Row
): Row {
  return Object.fromEntries(to.map((f, i) => [f.key, row[from[i]!.key]]))
}

class WriteExecution<Meta extends QueryMeta> {
  readonly #tx: Transaction<Meta>
  readonly #native: boolean

  constructor(tx: Transaction<Meta>) {
    this.#tx = tx
    this.#native = tx.dialect.runtime !== 'mysql'
  }

  query(data: SelectQuery | WriteQuery): SingleQuery<Array<Row>, Meta> {
    return this.#tx.$query(data as SelectQuery) as unknown as SingleQuery<
      Array<Row>,
      Meta
    >
  }

  *read(
    model: HasTable,
    where?: HasSql<boolean>
  ): Generator<Promise<unknown>, Array<Row>, unknown> {
    return yield* this.query({
      select: defaults(model),
      from: model,
      where,
      for:
        !this.#native && this.#tx.driver.supportsTransactions
          ? sql`update`
          : undefined
    })
  }

  #clientValues(
    model: HasTable,
    values: Array<Row>,
    needed: Array<FieldData>,
    update = false
  ): Array<Row> {
    return values.map(value => {
      const result = {...value}
      for (const f of needed) {
        const column = getData(getTable(model).columns[f.key]!)
        if (!update && result[f.key] === undefined && column.$default)
          result[f.key] = column.$default()
        const v = result[f.key]
        if (
          (!update && v === undefined) ||
          (v && typeof v === 'object' && hasSql(v)) ||
          (update && v === undefined && column.$onUpdate)
        )
          throw new Error(
            `MySQL requires explicit or client-generated relation field ${f.key}`
          )
      }
      return result
    })
  }

  *insert(
    model: HasTable,
    values: Array<Row>,
    needed: Array<FieldData> = []
  ): Generator<Promise<unknown>, Array<Row>, unknown> {
    if (!values.length) return []
    const native = this.#native
    const input = native ? values : this.#clientValues(model, values, needed)
    const rows = yield* this.query({
      insert: model,
      values: input,
      returning: native && needed.length ? defaults(model) : undefined
    })
    return native && needed.length ? rows : input
  }

  *execute(
    segment: Segment,
    output?: Output
  ): Generator<Promise<unknown>, Array<unknown>, unknown> {
    const {model, where, actions} = segment
    const native = this.#native
    const parents = actions.filter(action => action.ownsRoot)
    const dependents = actions.filter(action => !action.ownsRoot)
    const needed = dependents.flatMap(a => a.relation.from)
    const capture = needed.length > 0 || output?.kind === 'select'
    let query = segment.query
    const captureBefore = parents.length > 0 || (!query && capture)
    let roots =
      query && 'insert' in query
        ? query.values
        : captureBefore
          ? yield* this.read(model, where)
          : []
    if (((query && 'insert' in query) || captureBefore) && !roots.length)
      return []
    if (parents.length) query ??= {update: model, set: {}, where}
    const assigned = new Set(
      parents.flatMap(a => a.relation.from.map(f => f.key))
    )
    if (!native) {
      const unresolved = needed.filter(f => !assigned.has(f.key))
      if (query && 'insert' in query)
        query.values = this.#clientValues(model, query.values, unresolved)
      else if (query && 'update' in query)
        query.set = this.#clientValues(model, [query.set], unresolved, true)[0]!
    }
    const deletes: Array<{model: HasTable; where: HasSql<boolean>}> = []
    for (const action of parents) {
      const r = action.relation
      let related: Array<Row>
      if (action.kind === 'insert')
        related = yield* this.insert(r.model, action.values!, r.to)
      else
        related = yield* this.read(
          r.model,
          and(
            r.filter(action.where),
            action.kind === 'connect' ? undefined : matches(r.to, roots, r.from)
          )
        )
      if (action.kind === 'insert' || action.kind === 'connect') {
        if (related.length !== 1)
          throw new Error('One relation requires exactly one target')
        const changes = assignments(r.from, r.to, related[0]!)
        if (query && 'insert' in query)
          query.values = query.values.map(row => ({...row, ...changes}))
        else if (query && 'update' in query) Object.assign(query.set, changes)
      } else {
        const condition = matches(r.from, related, r.to)
        if (action.kind === 'delete') {
          deletes.push({model: r.model, where: matches(r.to, related)})
        }
        if (query && 'insert' in query)
          query.values = query.values.map(row => ({
            ...row,
            ...Object.fromEntries(
              r.from.map(f => [
                f.key,
                related.some(target =>
                  r.from.every((f, i) => row[f.key] === target[r.to[i]!.key])
                )
                  ? null
                  : row[f.key]
              ])
            )
          }))
        else if (query && 'update' in query)
          for (const f of r.from)
            query.set[f.key] = when([condition, null], field(f))
      }
    }
    if (!native && query && 'update' in query && needed.length) {
      const {set} = query
      roots = yield* this.query({
        select: Object.fromEntries(
          needed.map(f => {
            const column = getData(getTable(model).columns[f.key]!)
            return [
              f.key,
              set[f.key] === undefined
                ? field(f)
                : mapToColumn(column, set[f.key]).mapWith(column)
            ]
          })
        ),
        from: model,
        where,
        for: this.#tx.driver.supportsTransactions ? sql`update` : undefined
      })
    }
    let returned: Array<unknown> = []
    if (query) {
      if (native && (capture || output?.kind === 'returning'))
        query.returning = {
          ...(capture && {root: defaults(model)}),
          ...(output?.kind === 'returning' && {result: output.selection})
        }
      const result = yield* this.query(query)
      if (native) {
        roots = capture ? result.map(row => row.root as Row) : []
        if (output?.kind === 'returning')
          returned = result.map(row => row.result)
      } else if ('insert' in query) roots = query.values
    }
    for (const deletion of deletes)
      yield* this.query({delete: deletion.model, where: deletion.where})
    for (const action of dependents) yield* action.execute(this, roots)
    if (output?.kind === 'select') {
      const table = getTable(model)
      const columns = Object.entries(table.columns)
      // The empty table arm supplies column types; captured values supply rows.
      const empty = sql.query({
        select: sql.join(
          columns.map(([key, col]) => sql.identifier(getData(col).name ?? key)),
          sql`, `
        ),
        from: table.identifier(),
        where: sql`false`
      })
      for (const root of roots) {
        const source = sql.query(empty, {
          unionAll: sql.query({
            select: sql.join(
              columns.map(([key, col]) => mapToColumn(getData(col), root[key])),
              sql`, `
            )
          })
        })
        returned.push(
          ...(yield* this.query({
            select: output.selection,
            from: sql`(${source}) as ${sql.identifier(table.aliased)}`
          }))
        )
      }
    }
    return returned
  }
}
