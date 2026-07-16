import {and} from '../expr/Conditions.ts'
import type {Field, StripFieldMeta} from '../expr/Field.ts'
import type {Input as UserInput} from '../expr/Input.ts'
import {Index} from '../Index.ts'
import {
  type HasData,
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
import type {IsMysql, IsPostgres, IsSqlite, QueryMeta} from '../MetaData.ts'
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
import {Sql, type TargetScope, sql} from '../Sql.ts'
import type {Table, TableDefinition, TableFields} from '../Table.ts'
import type {Expand} from '../Types.ts'
import type {VirtualTarget} from '../Virtual.ts'
import {formatCTE} from './CTE.ts'
import type {
  CompoundSelect,
  IndexHint,
  IndexHintConfig,
  Join,
  JoinOp,
  QueryBase,
  SelectQuery,
  UnionOp,
  UnionQuery,
  Union as UnionSegment
} from './Query.ts'
import {formatModifiers} from './Shared.ts'

type MySqlIndexHintConfig = Pick<
  IndexHintConfig,
  'useIndex' | 'forceIndex' | 'ignoreIndex'
>
type SqliteIndexHintConfig = Pick<IndexHintConfig, 'indexedBy'>
type IndexHintConfigFor<Meta extends QueryMeta> = Meta extends IsMysql
  ? MySqlIndexHintConfig
  : Meta extends IsSqlite
    ? SqliteIndexHintConfig
    : never

type UnionTarget<Input, Meta extends QueryMeta> =
  | UnionBase<Input, Meta>
  | ((self: Input & HasTarget) => UnionBase<Input, Meta>)
type UnionSegmentQuery = SelectQuery | UnionQuery

function isUnionQuery(query: UnionSegmentQuery): query is UnionQuery {
  return Array.isArray((query as UnionQuery).select)
}

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

type SelectFirstResult<Input, Nullable extends boolean> =
  | Expand<SelectionRow<Input>>
  | (Nullable extends true ? null : never)

export class SelectFirst<
  Input,
  Meta extends QueryMeta = QueryMeta,
  Nullable extends boolean = false
> extends SingleQuery<
  Expand<SelectionRow<Input>> | (Nullable extends true ? null : never),
  Meta
> {
  readonly [internalData]: QueryData<Meta> & SelectQuery

  constructor(data: QueryData<Meta> & SelectQuery) {
    const inner = {...data, first: true}
    super(inner)
    this[internalData] = inner
  }

  get [internalSelection](): Selection {
    return querySelection(getData(this))
  }

  get [internalQuery](): Sql<SelectFirstResult<Input, Nullable>> {
    return selectQuery(getData(this)) as Sql<SelectFirstResult<Input, Nullable>>
  }

  get [internalSql](): Sql<SelectFirstResult<Input, Nullable>> {
    return mapScalarSelection(
      sql`(${getQuery(this)})`,
      getSelection(this).input
    ) as Sql<SelectFirstResult<Input, Nullable>>
  }
}

export abstract class UnionBase<Input, Meta extends QueryMeta = QueryMeta>
  extends SingleQuery<Array<SelectionRow<Input>>, Meta>
  implements HasSelection
{
  readonly [internalData]: QueryData<Meta>;
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

  #segmentSelect(
    segment: SelectQuery | UnionQuery | UnionSegment
  ): SelectQuery {
    const query = segment as UnionSegmentQuery
    if (isUnionQuery(query)) return query.select[0]!
    if ('union' in segment) return this.#segmentSelect(segment.union)
    if ('unionAll' in segment) return this.#segmentSelect(segment.unionAll)
    if ('intersect' in segment) return this.#segmentSelect(segment.intersect)
    if ('intersectAll' in segment)
      return this.#segmentSelect(segment.intersectAll)
    if ('except' in segment) return this.#segmentSelect(segment.except)
    if ('exceptAll' in segment) return this.#segmentSelect(segment.exceptAll)
    return segment as SelectQuery
  }

  #unionSegment(op: UnionOp, query: UnionSegmentQuery): UnionSegment {
    switch (op) {
      case 'union':
        return {union: query}
      case 'unionAll':
        return {unionAll: query}
      case 'intersect':
        return {intersect: query}
      case 'intersectAll':
        return {intersectAll: query}
      case 'except':
        return {except: query}
      case 'exceptAll':
        return {exceptAll: query}
    }
  }

  #assertMatchingFields(left: CompoundSelect, right: CompoundSelect): void {
    const fields = this.#selectFields(left[0]!)
    const assert = (query: SelectQuery) => {
      const names = this.#selectFields(query)
      if (fields.length !== names.length)
        throw new Error('Union segments must have the same fields')
      for (let i = 0; i < fields.length; i++)
        if (fields[i] !== names[i])
          throw new Error('Union segments must have the same fields')
    }

    for (const segment of left.slice(1)) assert(this.#segmentSelect(segment))
    for (const segment of right) assert(this.#segmentSelect(segment))
  }

  #appendCompound(
    left: CompoundSelect,
    op: UnionOp,
    right: UnionQuery
  ): CompoundSelect {
    const [firstRight, ...restRight] = right.select
    if (restRight.length === 0)
      return [...left, this.#unionSegment(op, firstRight)]
    return [...left, this.#unionSegment(op, right)] as CompoundSelect
  }

  #compound(op: UnionOp, target: UnionTarget<Input, Meta>): Union<Input, Meta> {
    const left = this.#getSelect(this)
    const rightBase =
      typeof target === 'function' ? target(this.#makeSelf()) : target
    const rightData = getData(rightBase) as QueryData<Meta> & UnionQuery
    const rightSelect = this.#getSelect(rightBase)
    const right = {...rightData, select: rightSelect}
    this.#assertMatchingFields(left, rightSelect)
    const select = this.#appendCompound(left, op, right)
    const {
      resolver,
      with: withDefs,
      withRecursive
    } = getData(this) as QueryData<Meta> & QueryBase
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

  from(
    from: HasTarget | Sql,
    config?: IndexHintConfigFor<Meta>
  ): Select<Input, Meta> {
    return new Select({...getData(this), from, ...config})
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
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
  ): Select<Input, Meta> {
    return this.#join({leftJoin, on, ...config})
  }

  leftJoinLateral(
    leftJoinLateral: HasTarget | Sql,
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
  ): Select<Input, Meta> {
    return this.#join({leftJoinLateral, on, ...config})
  }

  rightJoin(
    rightJoin: HasTarget | Sql,
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
  ): Select<Input, Meta> {
    return this.#join({rightJoin, on, ...config})
  }

  innerJoin(
    innerJoin: HasTarget | Sql,
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
  ): Select<Input, Meta> {
    return this.#join({innerJoin, on, ...config})
  }

  innerJoinLateral(
    innerJoinLateral: HasTarget | Sql,
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
  ): Select<Input, Meta> {
    return this.#join({innerJoinLateral, on, ...config})
  }

  fullJoin(
    fullJoin: HasTarget | Sql,
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
  ): Select<Input, Meta> {
    return this.#join({fullJoin, on, ...config})
  }

  crossJoin(
    crossJoin: HasTarget | Sql,
    config?: IndexHintConfigFor<Meta>
  ): Select<Input, Meta> {
    return this.#join({crossJoin, ...config})
  }

  crossJoinLateral(
    crossJoinLateral: HasTarget | Sql,
    config?: IndexHintConfigFor<Meta>
  ): Select<Input, Meta> {
    return this.#join({crossJoinLateral, ...config})
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

type RetypeSubQueryInput<Input, TableName extends string> =
  Input extends HasSql<infer Value>
    ? Field<Value, TableName>
    : Input extends SelectionRecord
      ? Expand<{
          [K in keyof Input]: RetypeSubQueryInput<Input[K], TableName>
        }>
      : Input

export interface SelectBase<Input, Meta extends QueryMeta = QueryMeta>
  extends UnionBase<StripFieldMeta<Input>, Meta>, HasSql<SelectionRow<Input>> {
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
    from: Table<Definition, Name>,
    config?: IndexHintConfigFor<Meta>
  ): AllFrom<
    TableFields<Definition>,
    Meta,
    Record<Name, TableFields<Definition>>
  >
  from<Input, Name extends string>(
    from: SubQuery<Input, Name>
  ): SelectionFromTargets<Input, Meta, Name>
  from<Input>(
    from: VirtualTarget<Input>
  ): SelectionFromTargets<Input, Meta, string>
}

export interface WithSelection<Input, Meta extends QueryMeta>
  extends SelectBase<Input, Meta>, HasSql<SelectionRow<Input>> {
  from<Definition extends TableDefinition, Name extends string>(
    from: Table<Definition, Name>,
    config?: IndexHintConfigFor<Meta>
  ): SelectionFromTargets<Input, Meta, Name>
  from<SubInput, Name extends string>(
    from: SubQuery<SubInput, Name>
  ): SelectionFromTargets<Input, Meta, Name>
  from<Name extends string>(
    from: HasTarget<Name>
  ): SelectionFromTargets<Input, Meta, Name>
  from(from: HasSql): Select<Input, Meta>
}

export interface AllFrom<
  Input,
  Meta extends QueryMeta,
  Tables = Input
> extends SelectBase<Input, Meta> {
  leftJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
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
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
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
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
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
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
  ): AllFrom<Expand<Tables & Record<Name, TableFields<Definition>>>, Meta>
  innerJoin<Input, Name extends string>(
    right: SubQuery<Input, Name>,
    on: HasSql<boolean>
  ): AllFrom<Expand<Tables & Record<Name, Input>>, Meta>
  innerJoinLateral<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
  ): AllFrom<Expand<Tables & Record<Name, TableFields<Definition>>>, Meta>
  innerJoinLateral<Input, Name extends string>(
    right: SubQuery<Input, Name>,
    on: HasSql<boolean>
  ): AllFrom<Expand<Tables & Record<Name, Input>>, Meta>
  crossJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    config?: IndexHintConfigFor<Meta>
  ): AllFrom<Expand<Tables & Record<Name, TableFields<Definition>>>, Meta>
  crossJoin<Input, Name extends string>(
    right: SubQuery<Input, Name>
  ): AllFrom<Expand<Tables & Record<Name, Input>>, Meta>
  crossJoinLateral<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    config?: IndexHintConfigFor<Meta>
  ): AllFrom<Expand<Tables & Record<Name, TableFields<Definition>>>, Meta>
  crossJoinLateral<Input, Name extends string>(
    right: SubQuery<Input, Name>
  ): AllFrom<Expand<Tables & Record<Name, Input>>, Meta>
  fullJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
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

type MarkFieldsAsNullable<Input, TableName extends string> =
  Input extends Table<infer Definition, TableName>
    ? TableFields<Definition> & IsNullable
    : Input extends Table
      ? Input
      : Expand<{
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

export interface SelectionFrom<
  Input,
  Meta extends QueryMeta
> extends SelectionFromTargets<Input, Meta, never> {}

interface SelectionFromTargets<
  Input,
  Meta extends QueryMeta,
  FromNames extends string = never
> extends SelectBase<Input, Meta> {
  leftJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
  ): SelectionFromTargets<
    MarkFieldsAsNullable<Input, Name>,
    Meta,
    FromNames | Name
  >
  leftJoin<Name extends string>(
    right: HasTarget<Name>,
    on: HasSql<boolean>
  ): SelectionFromTargets<
    MarkFieldsAsNullable<Input, Name>,
    Meta,
    FromNames | Name
  >
  leftJoin(
    right: HasTarget,
    on: HasSql<boolean>
  ): SelectionFromTargets<Input, Meta, FromNames>
  leftJoinLateral<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
  ): SelectionFromTargets<
    MarkFieldsAsNullable<Input, Name>,
    Meta,
    FromNames | Name
  >
  leftJoinLateral<Name extends string>(
    right: HasTarget<Name>,
    on: HasSql<boolean>
  ): SelectionFromTargets<
    MarkFieldsAsNullable<Input, Name>,
    Meta,
    FromNames | Name
  >
  rightJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
  ): SelectionFromTargets<
    MarkFieldsAsNullable<Input, FromNames>,
    Meta,
    FromNames | Name
  >
  rightJoin(
    right: HasTarget,
    on: HasSql<boolean>
  ): SelectionFromTargets<
    MarkFieldsAsNullable<Input, FromNames>,
    Meta,
    FromNames
  >
  innerJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
  ): SelectionFromTargets<Input, Meta, FromNames | Name>
  innerJoin(
    right: HasTarget,
    on: HasSql<boolean>
  ): SelectionFromTargets<Input, Meta, FromNames>
  innerJoinLateral<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
  ): SelectionFromTargets<Input, Meta, FromNames | Name>
  innerJoinLateral(
    right: HasTarget,
    on: HasSql<boolean>
  ): SelectionFromTargets<Input, Meta, FromNames>
  crossJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    config?: IndexHintConfigFor<Meta>
  ): SelectionFromTargets<Input, Meta, FromNames | Name>
  crossJoin(right: HasTarget): SelectionFromTargets<Input, Meta, FromNames>
  crossJoinLateral<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    config?: IndexHintConfigFor<Meta>
  ): SelectionFromTargets<Input, Meta, FromNames | Name>
  crossJoinLateral(
    right: HasTarget
  ): SelectionFromTargets<Input, Meta, FromNames>
  fullJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>,
    config?: IndexHintConfigFor<Meta>
  ): SelectionFromTargets<
    MarkFieldsAsNullable<MarkFieldsAsNullable<Input, FromNames>, Name>,
    Meta,
    FromNames | Name
  >
  fullJoin<Name extends string>(
    right: HasTarget<Name>,
    on: HasSql<boolean>
  ): SelectionFromTargets<
    MarkFieldsAsNullable<MarkFieldsAsNullable<Input, FromNames>, Name>,
    Meta,
    FromNames | Name
  >
  fullJoin(
    right: HasTarget,
    on: HasSql<boolean>
  ): SelectionFromTargets<
    MarkFieldsAsNullable<Input, FromNames>,
    Meta,
    FromNames
  >
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
      const sourceSql = source as HasSql
      if (!hasField(sourceSql) && !getSql(sourceSql).alias) return true
    }
    return false
  }
  if (hasSql(input as HasSql)) return false
  if (!input || typeof input !== 'object') return false
  return Object.values(input as Record<string, SelectionInput>).some(
    hasUnnamedDerivedSource
  )
}

export function querySelection(
  query: SelectQuery,
  targetScope?: TargetScope
): Selection {
  const {select, from} = query
  if (select) {
    if (from) {
      const selectedTargets = new Set<string>()
      const fromTargets = new Set<string>()
      collectReferencedTargets(select as SelectionInput, selectedTargets)
      collectFromTargets(from, fromTargets)
      if (fromTargets.size > 0) {
        for (const targetName of selectedTargets) {
          if (targetName === Sql.SELF_TARGET) continue
          const mappedName =
            targetScope?.sourceName === targetName
              ? targetScope.name
              : targetName
          if (!fromTargets.has(mappedName))
            throw new Error(`Unknown target in select: ${targetName}`)
        }
      }
    }
    if (hasSql(select) && hasSelection(select)) {
      const selected = getSelection(select as HasSelection)
      if (!from || !Array.isArray(from)) return selected
      const [, ...joins] = from
      return applyJoins(selected, joins)
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
  const {on, useIndex, forceIndex, ignoreIndex, indexedBy, ...rest} = join
  const op = Object.keys(rest)[0] as JoinOp
  const target = (<Record<string, HasTarget | Sql>>rest)[op]
  return {
    target,
    op,
    on,
    config: {useIndex, forceIndex, ignoreIndex, indexedBy}
  }
}

function indexHintName(hint: IndexHint): string {
  if (typeof hint === 'string') return hint
  if (hint instanceof Index) {
    const {name} = getData(hint as HasData<{name?: string}>)
    if (!name) throw new Error('Index hint requires a named index')
    return name
  }
  throw new Error('Invalid index hint')
}

function formatIndexHint(
  hints?: IndexHint | Array<IndexHint>
): Sql | undefined {
  const values = hints ? [hints].flat() : []
  if (values.length === 0) return
  const names = sql.join(
    values.map(index => sql.identifier(indexHintName(index))),
    sql`, `
  )
  return sql`(${names})`
}

function formatIndexHints(config?: IndexHintConfig): Sql | undefined {
  if (!config) return
  return sql.query({
    useIndex: formatIndexHint(config.useIndex),
    forceIndex: formatIndexHint(config.forceIndex),
    ignoreIndex: formatIndexHint(config.ignoreIndex),
    indexedBy: config.indexedBy
      ? sql.identifier(indexHintName(config.indexedBy))
      : undefined
  })
}

function formatTarget(target: HasTarget, indexHints?: IndexHintConfig): Sql {
  const formattedTarget = hasTable(target)
    ? getTable(target).target()
    : getTarget(target)
  if (!hasTable(target)) return formattedTarget
  return sql.join([formattedTarget, formatIndexHints(indexHints)])
}

function formatFrom(
  from: SelectQuery['from'],
  baseConfig?: IndexHintConfig
): Sql {
  if (!from) throw new Error('No target defined')
  if (Array.isArray(from)) {
    return sql.join(
      from.map(join => {
        if (hasTarget(join)) return formatTarget(join, baseConfig)
        if (hasSql(join)) return getSql(join)
        const {target, op, on, config} = joinOp(join)
        return sql.query({
          [op]: hasTarget(target)
            ? formatTarget(target, config)
            : getSql(target),
          on
        })
      })
    )
  }
  return hasTarget(from) ? formatTarget(from, baseConfig) : getSql(from)
}

export function selectQuery(
  query: SelectQuery,
  targetScope?: TargetScope
): Sql {
  const {from, where, groupBy, having, distinct, distinctOn} = query
  const prefix = distinctOn
    ? sql`distinct on (${sql.join(distinctOn, sql`, `)})`
    : distinct && sql`distinct`
  const selected = querySelection(query, targetScope)
  const select = sql.join([prefix, selected])

  return sql.query(
    formatCTE(query),
    {
      select,
      from: from && formatFrom(from, query),
      for: query.for,
      where,
      groupBy: groupBy && sql.join(groupBy, sql`, `),
      having: typeof having === 'function' ? having(selected.input) : having
    },
    formatModifiers(query, selected)
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
  const firstSelect = (query: UnionSegmentQuery): SelectQuery =>
    isUnionQuery(query) ? query.select[0]! : query
  const segmentQuery = (query: UnionSegmentQuery) => {
    if (isUnionQuery(query)) {
      const nested = unionQuery(query)
      return sql.universal({
        sqlite: sql`select * from (${nested})`,
        default: sql`(${nested})`
      })
    }
    const inner = selectQuery(query)
    return query.orderBy ||
      query.limit !== undefined ||
      query.offset !== undefined
      ? sql`(${inner})`
      : inner
  }
  const segments = sql.join(
    select.map((segment, i) => {
      if (i === 0) {
        fields = querySelection(segment as SelectQuery).fieldNames()
        return segmentQuery(segment as SelectQuery)
      }
      const op = Object.keys(segment)[0] as UnionOp
      const query = (<Record<UnionOp, UnionSegmentQuery>>segment)[op]
      const names = querySelection(firstSelect(query)).fieldNames()
      if (fields.length !== names.length)
        throw new Error('Union segments must have the same fields')
      for (let i = 0; i < fields.length; i++)
        if (fields[i] !== names[i])
          throw new Error('Union segments must have the same fields')
      return sql.query({[op]: segmentQuery(query)})
    })
  )
  return sql.query(formatCTE(query), segments, formatModifiers(query))
}
