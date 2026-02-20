import {
  type HasQuery,
  type HasSelection,
  type HasSql,
  type HasTarget,
  getData,
  getField,
  getQuery,
  getSelection,
  getSql,
  getTable,
  getTarget,
  hasField,
  hasSelection,
  hasSql,
  hasTable,
  hasTarget,
  internalData,
  internalQuery,
  internalSelection,
  internalSql,
  internalTarget
} from '../Internal.ts'
import type {IsMysql, IsPostgres, QueryMeta} from '../MetaData.ts'
import {type QueryData, SingleQuery} from '../Queries.ts'
import {
  type IsNullable,
  type MakeNullable,
  type Selection,
  type SelectionInput,
  type SelectionRecord,
  type SelectionRow,
  selection
} from '../Selection.ts'
import {Sql, sql} from '../Sql.ts'
import type {Table, TableDefinition, TableFields} from '../Table.ts'
import type {Expand} from '../Types.ts'
import type {VirtualTarget} from '../Virtual.ts'
import {and} from '../expr/Conditions.ts'
import type {Field, StripFieldMeta} from '../expr/Field.ts'
import type {Input as UserInput} from '../expr/Input.ts'
import {formatCTE} from './CTE.ts'
import type {
  CompoundSelect,
  Join,
  JoinOp,
  SelectQuery,
  UnionOp,
  UnionQuery
} from './Query.ts'
import {formatModifiers} from './Shared.ts'

type UnionTarget<Input, Meta extends QueryMeta> =
  | UnionBase<Input, Meta>
  | ((self: Input & HasTarget) => UnionBase<Input, Meta>)

function mapScalarSelection(query: Sql, selected: SelectionInput): Sql {
  if (hasSql(selected)) return query.mapWith(getSql(selected))
  if (selected && typeof selected === 'object') {
    const values = Object.values(selected)
    if (values.length === 1) {
      const first = values[0]
      if (first && typeof first === 'object' && hasSql(first))
        return query.mapWith(getSql(first))
    }
  }
  return query
}

export class SelectFirst<Input, Meta extends QueryMeta = QueryMeta>
  extends SingleQuery<SelectionRow<Input>, Meta>
  implements HasQuery<SelectionRow<Input>>
{
  readonly [internalData]: QueryData<Meta> & SelectQuery

  constructor(data: QueryData<Meta> & SelectQuery) {
    const inner = {...data, first: true}
    super(inner)
    this[internalData] = inner
  }

  get [internalSelection](): Selection {
    return querySelection(getData(this))
  }

  get [internalQuery](): Sql<SelectionRow<Input>> {
    return selectQuery(getData(this)) as Sql<SelectionRow<Input>>
  }

  get [internalSql](): Sql<SelectionRow<Input>> {
    return mapScalarSelection(
      sql`(${getQuery(this)})`,
      getSelection(this).input
    ) as Sql<SelectionRow<Input>>
  }
}

export abstract class UnionBase<Input, Meta extends QueryMeta = QueryMeta>
  extends SingleQuery<Array<SelectionRow<Input>>, Meta>
  implements HasSelection
{
  readonly [internalData]: QueryData<Meta>
  abstract [internalSelection]: Selection

  constructor(data: QueryData<Meta> & {compound: CompoundSelect}) {
    super(data)
    this[internalData] = data
  }

  as<Name extends string>(alias: Name): SubQuery<Input, Name> {
    const selected = getSelection(this)
    const fields = selected.makeVirtual<Input>(alias)
    return Object.assign(<any>{}, fields, {
      [internalSelection]: selection(fields),
      [internalSql]: mapScalarSelection(
        sql`(${getQuery(this)})`,
        selected.input
      ),
      [internalTarget]: sql`(${getQuery(this)}) as ${sql.identifier(
        alias
      )}`.inlineFields(true)
    })
  }

  #makeSelf(): Input & HasTarget {
    const selected = getSelection(this)
    return selected.makeVirtual<Input>(Sql.SELF_TARGET)
  }

  #getSelect(base: UnionBase<any>): CompoundSelect {
    const data = getData(base)
    if (!('compound' in data)) throw new Error('No compound defined')
    return data.compound as CompoundSelect
  }

  #selectFields(select: SelectQuery): Array<string> {
    return querySelection(select).fieldNames()
  }

  #assertMatchingFields(
    left: CompoundSelect,
    right: CompoundSelect
  ): Array<string> {
    const getSelect = (segment: SelectQuery | Union): SelectQuery => {
      if ('select' in segment) return segment
      const op = Object.keys(segment)[0] as UnionOp
      return segment[op]
    }

    const fields = this.#selectFields(left[0]!)
    const assert = (query: SelectQuery) => {
      const names = this.#selectFields(query)
      if (fields.length !== names.length)
        throw new Error('Union segments must have the same fields')
      for (let i = 0; i < fields.length; i++)
        if (fields[i] !== names[i])
          throw new Error('Union segments must have the same fields')
    }

    for (const segment of left.slice(1)) assert(getSelect(segment))
    for (const segment of right) assert(getSelect(segment))
    return fields
  }

  #compound(op: UnionOp, target: UnionTarget<Input, Meta>): Union<Input, Meta> {
    const left = this.#getSelect(this)
    const rightBase =
      typeof target === 'function' ? target(this.#makeSelf()) : target
    const right = this.#getSelect(rightBase)
    this.#assertMatchingFields(left, right)
    const select =
      right.length > 1
        ? ([
            ...left,
            {
              [op]: {
                from: rightBase.as('__setop_right')
              } as SelectQuery
            }
          ] as CompoundSelect)
        : ([...left, {[op]: right[0]!}] as CompoundSelect)
    const {resolver, with: withDefs, withRecursive} = getData(this)
    return new Union({
      resolver,
      with: withDefs,
      withRecursive,
      select
    })
  }

  union(target: UnionTarget<Input, Meta>): Union<Input, Meta> {
    return this.#compound('union', target)
  }

  unionAll(target: UnionTarget<Input, Meta>): Union<Input, Meta> {
    return this.#compound('unionAll', target)
  }

  intersect(target: UnionTarget<Input, Meta>): Union<Input, Meta> {
    return this.#compound('intersect', target)
  }

  intersectAll<Meta extends IsPostgres | IsMysql>(
    this: UnionBase<Input, Meta>,
    target: UnionTarget<Input, Meta>
  ): Union<Input, Meta> {
    return this.#compound('intersectAll', target)
  }

  except(target: UnionTarget<Input, Meta>): Union<Input, Meta> {
    return this.#compound('except', target)
  }

  exceptAll<Meta extends IsPostgres | IsMysql>(
    this: UnionBase<Input, Meta>,
    target: UnionTarget<Input, Meta>
  ): Union<Input, Meta> {
    return this.#compound('exceptAll', target)
  }
}

const forKeywords = ['update', 'no key update', 'share', 'key share'] as const

export class Select<Input, Meta extends QueryMeta = QueryMeta>
  extends UnionBase<StripFieldMeta<Input>, Meta>
  implements
    HasSelection,
    SelectBase<Input, Meta>,
    HasQuery<Array<SelectionRow<Input>>>
{
  readonly [internalData]: QueryData<Meta> & SelectQuery

  constructor(data: QueryData<Meta> & SelectQuery) {
    const compound: CompoundSelect = [data]
    const withCompound = {...data, compound}
    super(withCompound)
    this[internalData] = withCompound
  }

  from(from: HasTarget | Sql): Select<Input, Meta> {
    return new Select({...getData(this), from})
  }

  for(
    keyword: (typeof forKeywords)[number],
    config: {
      of?: HasTarget | Array<HasTarget>
      noWait?: boolean
      skipLocked?: boolean
    } = {}
  ): Select<Input, Meta> {
    if (!forKeywords.includes(keyword))
      throw new Error(`Invalid FOR keyword: ${keyword}`)
    return new Select({
      ...getData(this),
      for: sql.query(sql.unsafe(keyword), {
        of: config.of && sql.join([config.of].flat().map(getTarget), sql`, `),
        nowait: config.noWait,
        skipLocked: config.skipLocked
      })
    })
  }

  #fromTarget(): [HasTarget | Sql, ...Array<Join<HasTarget | Sql>>] {
    const {from} = getData(this)
    if (!from) throw new Error('No target defined')
    if (Array.isArray(from)) return from
    return [from]
  }

  #join(join: Join<HasTarget | Sql>): Select<Input, Meta> {
    return new Select({...getData(this), from: [...this.#fromTarget(), join]})
  }

  leftJoin(
    leftJoin: HasTarget | Sql,
    on: HasSql<boolean>
  ): Select<Input, Meta> {
    return this.#join({leftJoin, on})
  }

  leftJoinLateral(
    leftJoinLateral: HasTarget | Sql,
    on: HasSql<boolean>
  ): Select<Input, Meta> {
    return this.#join({leftJoinLateral, on})
  }

  rightJoin(
    rightJoin: HasTarget | Sql,
    on: HasSql<boolean>
  ): Select<Input, Meta> {
    return this.#join({rightJoin, on})
  }

  innerJoin(
    innerJoin: HasTarget | Sql,
    on: HasSql<boolean>
  ): Select<Input, Meta> {
    return this.#join({innerJoin, on})
  }

  innerJoinLateral(
    innerJoinLateral: HasTarget | Sql,
    on: HasSql<boolean>
  ): Select<Input, Meta> {
    return this.#join({innerJoinLateral, on})
  }

  fullJoin(
    fullJoin: HasTarget | Sql,
    on: HasSql<boolean>
  ): Select<Input, Meta> {
    return this.#join({fullJoin, on})
  }

  crossJoin(crossJoin: HasTarget | Sql): Select<Input, Meta> {
    return this.#join({crossJoin})
  }

  crossJoinLateral(crossJoinLateral: HasTarget | Sql): Select<Input, Meta> {
    return this.#join({crossJoinLateral})
  }

  where(...where: Array<HasSql<boolean> | undefined>): Select<Input, Meta> {
    return new Select({...getData(this), where: and(...where)})
  }

  groupBy(...groupBy: Array<HasSql>): Select<Input, Meta> {
    return new Select({...getData(this), groupBy})
  }

  having(
    having: HasSql<boolean> | ((self: Input) => HasSql<boolean>)
  ): Select<Input, Meta> {
    return new Select({...getData(this), having: having as any})
  }

  orderBy(...orderBy: Array<HasSql>): Select<Input, Meta> {
    return new Select({...getData(this), orderBy})
  }

  limit(limit: UserInput<number>): Select<Input, Meta> {
    return new Select({...getData(this), limit})
  }

  offset(offset: UserInput<number>): Select<Input, Meta> {
    return new Select({...getData(this), offset})
  }

  $dynamic(): this {
    return this
  }

  $first(): SelectFirst<Input, Meta> {
    return new SelectFirst(getData(this))
  }

  get [internalSelection](): Selection {
    return querySelection(getData(this))
  }

  get [internalQuery](): Sql<Array<SelectionRow<Input>>> {
    return selectQuery(getData(this)) as Sql<Array<SelectionRow<Input>>>
  }

  get [internalSql](): Sql<SelectionRow<Input>> {
    return sql`(${getQuery(this)})`
  }
}

export type SubQuery<Input, Name extends string = string> = RetypeSubQueryInput<
  Input,
  Name
> &
  HasTarget<Name> &
  HasSelection

type RetypeSubQueryInput<
  Input,
  TableName extends string
> = Input extends HasSql<infer Value>
  ? Field<Value, TableName>
  : Input extends SelectionRecord
    ? Expand<{
        [K in keyof Input]: RetypeSubQueryInput<Input[K], TableName>
      }>
    : Input

export interface SelectBase<Input, Meta extends QueryMeta = QueryMeta>
  extends UnionBase<StripFieldMeta<Input>, Meta>,
    HasSql<SelectionRow<Input>> {
  for(
    keyword: (typeof forKeywords)[number],
    config?: {
      of?: HasTarget | Array<HasTarget>
      noWait?: boolean
      skipLocked?: boolean
    }
  ): Select<Input, Meta>
  where(...where: Array<HasSql<boolean> | undefined>): Select<Input, Meta>
  groupBy(...exprs: Array<HasSql>): Select<Input, Meta>
  having(having: HasSql<boolean>): Select<Input, Meta>
  orderBy(...exprs: Array<HasSql>): Select<Input, Meta>
  limit(limit: UserInput<number>): Select<Input, Meta>
  offset(offset: UserInput<number>): Select<Input, Meta>
  $dynamic(): this
}

export interface WithoutSelection<Meta extends QueryMeta> {
  from<Definition extends TableDefinition, Name extends string>(
    from: Table<Definition, Name>
  ): AllFrom<
    TableFields<Definition>,
    Meta,
    Record<Name, TableFields<Definition>>
  >
  from<Input>(from: SubQuery<Input>): SelectionFrom<Input, Meta>
  from<Input>(from: VirtualTarget<Input>): SelectionFrom<Input, Meta>
}

export interface WithSelection<Input, Meta extends QueryMeta>
  extends SelectBase<Input, Meta>,
    HasSql<SelectionRow<Input>> {
  from<Definition extends TableDefinition, Name extends string>(
    from: Table<Definition, Name>
  ): SelectionFrom<Input, Meta>
  from(from: HasTarget): SelectionFrom<Input, Meta>
  from(from: SubQuery<unknown>): SelectionFrom<Input, Meta>
  from(from: HasSql): Select<Input, Meta>
}

export interface AllFrom<Input, Meta extends QueryMeta, Tables = Input>
  extends SelectBase<Input, Meta> {
  leftJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): AllFrom<
    Expand<Tables & MakeNullable<Record<Name, TableFields<Definition>>>>,
    Meta
  >
  leftJoin<Input, Name extends string>(
    right: SubQuery<Input, Name>,
    on: HasSql<boolean>
  ): AllFrom<Expand<Tables & MakeNullable<Record<Name, Input>>>, Meta>
  leftJoinLateral<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): AllFrom<
    Expand<Tables & MakeNullable<Record<Name, TableFields<Definition>>>>,
    Meta
  >
  leftJoinLateral<Input, Name extends string>(
    right: SubQuery<Input, Name>,
    on: HasSql<boolean>
  ): AllFrom<Expand<Tables & MakeNullable<Record<Name, Input>>>, Meta>
  rightJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): AllFrom<
    Expand<MakeNullable<Tables> & Record<Name, TableFields<Definition>>>,
    Meta
  >
  rightJoin<Input, Name extends string>(
    right: SubQuery<Input, Name>,
    on: HasSql<boolean>
  ): AllFrom<Expand<MakeNullable<Tables> & Record<Name, Input>>, Meta>
  innerJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): AllFrom<Expand<Tables & Record<Name, TableFields<Definition>>>, Meta>
  innerJoin<Input, Name extends string>(
    right: SubQuery<Input, Name>,
    on: HasSql<boolean>
  ): AllFrom<Expand<Tables & Record<Name, Input>>, Meta>
  innerJoinLateral<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): AllFrom<Expand<Tables & Record<Name, TableFields<Definition>>>, Meta>
  innerJoinLateral<Input, Name extends string>(
    right: SubQuery<Input, Name>,
    on: HasSql<boolean>
  ): AllFrom<Expand<Tables & Record<Name, Input>>, Meta>
  crossJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>
  ): AllFrom<Expand<Tables & Record<Name, TableFields<Definition>>>, Meta>
  crossJoin<Input, Name extends string>(
    right: SubQuery<Input, Name>
  ): AllFrom<Expand<Tables & Record<Name, Input>>, Meta>
  crossJoinLateral<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>
  ): AllFrom<Expand<Tables & Record<Name, TableFields<Definition>>>, Meta>
  crossJoinLateral<Input, Name extends string>(
    right: SubQuery<Input, Name>
  ): AllFrom<Expand<Tables & Record<Name, Input>>, Meta>
  fullJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): AllFrom<
    Expand<
      MakeNullable<Tables> & MakeNullable<Record<Name, TableFields<Definition>>>
    >,
    Meta
  >
  fullJoin<Input, Name extends string>(
    right: SubQuery<Input, Name>,
    on: HasSql<boolean>
  ): AllFrom<
    Expand<MakeNullable<Tables> & MakeNullable<Record<Name, Input>>>,
    Meta
  >
}

type MarkFieldsAsNullable<Input, TableName extends string> = Expand<{
  [K in keyof Input]: Input[K] extends Field<infer T, TableName>
    ? HasSql<T | null>
    : Input[K] extends Table<infer Definition, TableName>
      ? TableFields<Definition> & IsNullable
      : Input[K] extends Record<
            string,
            Field<unknown, TableName> | HasSql<unknown>
          >
        ? Input[K] & IsNullable
        : Input[K] extends SelectionRecord
          ? MarkFieldsAsNullable<Input[K], TableName>
          : Input[K]
}>

export interface SelectionFrom<Input, Meta extends QueryMeta>
  extends SelectBase<Input, Meta> {
  leftJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): SelectionFrom<MarkFieldsAsNullable<Input, Name>, Meta>
  leftJoin<Name extends string>(
    right: HasTarget<Name>,
    on: HasSql<boolean>
  ): SelectionFrom<MarkFieldsAsNullable<Input, Name>, Meta>
  leftJoin(right: HasTarget, on: HasSql<boolean>): SelectionFrom<Input, Meta>
  leftJoinLateral<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): SelectionFrom<MarkFieldsAsNullable<Input, Name>, Meta>
  leftJoinLateral<Name extends string>(
    right: HasTarget<Name>,
    on: HasSql<boolean>
  ): SelectionFrom<MarkFieldsAsNullable<Input, Name>, Meta>
  rightJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): SelectionFrom<Input, Meta>
  rightJoin(right: HasTarget, on: HasSql<boolean>): SelectionFrom<Input, Meta>
  innerJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): SelectionFrom<Input, Meta>
  innerJoin(right: HasTarget, on: HasSql<boolean>): SelectionFrom<Input, Meta>
  innerJoinLateral<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): SelectionFrom<Input, Meta>
  innerJoinLateral(
    right: HasTarget,
    on: HasSql<boolean>
  ): SelectionFrom<Input, Meta>
  crossJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>
  ): SelectionFrom<Input, Meta>
  crossJoin(right: HasTarget): SelectionFrom<Input, Meta>
  crossJoinLateral<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>
  ): SelectionFrom<Input, Meta>
  crossJoinLateral(right: HasTarget): SelectionFrom<Input, Meta>
  fullJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): SelectionFrom<Input, Meta>
  fullJoin<Name extends string>(
    right: HasTarget<Name>,
    on: HasSql<boolean>
  ): SelectionFrom<MarkFieldsAsNullable<Input, Name>, Meta>
  fullJoin(right: HasTarget, on: HasSql<boolean>): SelectionFrom<Input, Meta>
}

function collectReferencedTargets(input: SelectionInput, names: Set<string>) {
  if (hasSql(input as HasSql)) {
    if (hasField(input)) {
      const field = getField(input)
      const source = field.source
      if (!(source && typeof source === 'object' && hasSql(source as HasSql)))
        names.add(field.targetName)
    }
    return
  }
  if (!input || typeof input !== 'object') return
  for (const value of Object.values(input as Record<string, SelectionInput>))
    collectReferencedTargets(value, names)
}

function collectFromTargets(from: SelectQuery['from'], names: Set<string>) {
  if (!from) return
  const collect = (target: HasTarget) => {
    if (hasTable(target)) {
      names.add(getTable(target).aliased)
      return
    }
    if (!hasSelection(target)) return
    collectReferencedTargets(getSelection(target).input, names)
  }
  if (Array.isArray(from)) {
    for (const entry of from) {
      if (hasTarget(entry)) collect(entry)
      else if (!hasSql(entry)) {
        const {target} = joinOp(entry)
        if (hasTarget(target)) collect(target)
      }
    }
    return
  }
  if (hasTarget(from)) collect(from)
}

function hasUnnamedDerivedSource(input: SelectionInput): boolean {
  if (hasField(input)) {
    const source = getField(input).source
    if (source && typeof source === 'object' && hasSql(source as HasSql)) {
      if (!hasField(source) && !getSql(source).alias) return true
    }
    return false
  }
  if (hasSql(input as HasSql)) return false
  if (!input || typeof input !== 'object') return false
  return Object.values(input as Record<string, SelectionInput>).some(
    hasUnnamedDerivedSource
  )
}

export function querySelection({select, from}: SelectQuery): Selection {
  if (select) {
    if (from) {
      const selectedTargets = new Set<string>()
      const fromTargets = new Set<string>()
      collectReferencedTargets(select as SelectionInput, selectedTargets)
      collectFromTargets(from, fromTargets)
      if (fromTargets.size > 0) {
        for (const targetName of selectedTargets)
          if (!fromTargets.has(targetName))
            throw new Error(`Unknown target in select: ${targetName}`)
      }
    }
    if (!from || !Array.isArray(from))
      return selection(select as SelectionInput)
    const [, ...joins] = from
    return applyJoins(selection(select as SelectionInput), joins)
  }

  if (!from) throw new Error('No selection defined')
  if (Array.isArray(from)) {
    const [target, ...joins] = from
    return applyJoins(selection(target), joins)
  }
  if (hasSelection(from)) {
    const selected = getSelection(from)
    if (hasUnnamedDerivedSource(selected.input))
      throw new Error('Cannot select all from subquery without alias')
    return selected
  }
  return selection(sql`*`)
}

function applyJoins(base: Selection, joins: Array<Join>): Selection {
  let current = base
  for (const join of joins) {
    const {target, op} = joinOp(join)
    current = current.join(target, op)
  }
  return current
}

function joinOp(join: Join) {
  const {on, ...rest} = join
  const op = Object.keys(rest)[0] as JoinOp
  const target = (<Record<string, HasTarget | Sql>>rest)[op]
  return {target, op, on}
}

function formatTarget(target: HasTarget): Sql {
  if (hasTable(target)) return getTable(target).target()
  return getTarget(target)
}

function formatFrom(from: SelectQuery['from']): Sql {
  if (!from) throw new Error('No target defined')
  if (Array.isArray(from)) {
    return sql.join(
      from.map(join => {
        if (hasTarget(join)) return formatTarget(join)
        if (hasSql(join)) return getSql(join)
        const {target, op, on} = joinOp(join)
        return sql.query({
          [op]: hasTarget(target) ? formatTarget(target) : getSql(target),
          on
        })
      })
    )
  }
  return hasTarget(from) ? formatTarget(from) : getSql(from)
}

export function selectQuery(query: SelectQuery): Sql {
  const {from, where, groupBy, having, distinct, distinctOn} = query
  const prefix = distinctOn
    ? sql`distinct on (${sql.join(distinctOn, sql`, `)})`
    : distinct && sql`distinct`
  const selected = querySelection(query)
  const select = sql.join([prefix, selected])

  return sql.query(
    formatCTE(query),
    {
      select,
      from: from && formatFrom(from),
      for: query.for,
      where,
      groupBy: groupBy && sql.join(groupBy, sql`, `),
      having: typeof having === 'function' ? having(selected.input) : having
    },
    formatModifiers(query)
  )
}

export class Union<Result, Meta extends QueryMeta = QueryMeta>
  extends UnionBase<Result, Meta>
  implements HasSelection
{
  readonly [internalData]: QueryData<Meta> & UnionQuery

  constructor(data: QueryData<Meta> & UnionQuery) {
    const compound = data.select
    const withCompound = {...data, compound}
    super(withCompound)
    this[internalData] = withCompound
  }

  get [internalQuery](): Sql {
    return unionQuery(getData(this))
  }

  get [internalSelection](): Selection {
    const {
      select: [first]
    } = getData(this)
    return querySelection(first)
  }

  orderBy(...orderBy: Array<HasSql>): Union<Result, Meta> {
    return new Union({...getData(this), orderBy})
  }

  limit(limit: UserInput<number>): Union<Result, Meta> {
    return new Union({...getData(this), limit})
  }

  offset(offset: UserInput<number>): Union<Result, Meta> {
    return new Union({...getData(this), offset})
  }
}

export function union<Result, Meta extends QueryMeta>(
  left: UnionBase<Result, Meta>,
  right: UnionBase<Result, Meta>,
  ...rest: Array<UnionBase<Result, Meta>>
): Union<Result, Meta> {
  return [right, ...rest].reduce(
    (acc, query) => acc.union(query),
    left
  ) as Union<Result, Meta>
}

export function unionAll<Result, Meta extends QueryMeta>(
  left: UnionBase<Result, Meta>,
  right: UnionBase<Result, Meta>,
  ...rest: Array<UnionBase<Result, Meta>>
): Union<Result, Meta> {
  return [right, ...rest].reduce(
    (acc, query) => acc.unionAll(query),
    left
  ) as Union<Result, Meta>
}

export function intersect<Result, Meta extends QueryMeta>(
  left: UnionBase<Result, Meta>,
  right: UnionBase<Result, Meta>,
  ...rest: Array<UnionBase<Result, Meta>>
): Union<Result, Meta> {
  return [right, ...rest].reduce(
    (acc, query) => acc.intersect(query),
    left
  ) as Union<Result, Meta>
}

export function intersectAll<Result, Meta extends IsPostgres | IsMysql>(
  left: UnionBase<Result, Meta>,
  right: UnionBase<Result, Meta>,
  ...rest: Array<UnionBase<Result, Meta>>
): Union<Result, Meta> {
  return [right, ...rest].reduce(
    (acc, query) => acc.intersectAll(query),
    left
  ) as Union<Result, Meta>
}

export function except<Result, Meta extends QueryMeta>(
  left: UnionBase<Result, Meta>,
  right: UnionBase<Result, Meta>,
  ...rest: Array<UnionBase<Result, Meta>>
): Union<Result, Meta> {
  return [right, ...rest].reduce(
    (acc, query) => acc.except(query),
    left
  ) as Union<Result, Meta>
}

export function exceptAll<Result, Meta extends IsPostgres | IsMysql>(
  left: UnionBase<Result, Meta>,
  right: UnionBase<Result, Meta>,
  ...rest: Array<UnionBase<Result, Meta>>
): Union<Result, Meta> {
  return [right, ...rest].reduce(
    (acc, query) => acc.exceptAll(query),
    left
  ) as Union<Result, Meta>
}

export function unionQuery(query: UnionQuery): Sql {
  const {select} = query
  let fields: Array<string>
  const segments = sql.join(
    select.map((segment, i) => {
      if (i === 0) {
        fields = querySelection(segment as SelectQuery).fieldNames()
        return selectQuery(segment as SelectQuery)
      }
      const op = Object.keys(segment)[0] as UnionOp
      const query = (<Record<UnionOp, SelectQuery>>segment)[op]
      const names = querySelection(query).fieldNames()
      if (fields.length !== names.length)
        throw new Error('Union segments must have the same fields')
      for (let i = 0; i < fields.length; i++)
        if (fields[i] !== names[i])
          throw new Error('Union segments must have the same fields')
      return sql.query({[op]: selectQuery(query)})
    })
  )
  return sql.query(formatCTE(query), segments, formatModifiers(query))
}
