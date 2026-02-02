import {
  type HasQuery,
  type HasSelection,
  type HasValue,
  type HasTarget,
  type Internal,
  get,
  internal
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

interface SelectData extends Internal, SelectQuery {}

export class SelectFirst<
  Input,
  Meta extends QueryMeta = QueryMeta
> extends SingleQuery<SelectionRow<Input>, Meta> {
  readonly [internal]: SelectData & {query: Sql<SelectionRow<Input>>}

  constructor(inner: SelectData) {
    super(inner)
    this[internal] = {
      ...inner,
      get query() {
        return selectQuery(this as SelectQuery) as Sql<SelectionRow<Input>>
      },
      selection: querySelection(inner)
    }
  }
}

interface UnionBaseData extends SelectData {
  compound: CompoundSelect
}

export abstract class UnionBase<Input, Meta extends QueryMeta = QueryMeta>
  extends SingleQuery<Array<SelectionRow<Input>>, Meta>
  implements HasSelection
{
  readonly [internal]: UnionBaseData

  as<Name extends string>(alias: Name): SubQuery<Input, Name> {
    const {selection: selected} = get(this)
    const fields = selected!.makeVirtual<Input>(alias)
    const querySql = get(this).query!
    return Object.assign(<any>fields, {
      [internal]: {
        selection: selection(fields),
        target: sql`(${querySql}) as ${sql.identifier(alias)}`.inlineFields(true)
      }
    })
  }

  #makeSelf(): Input & HasTarget {
    const {selection: selected} = get(this)
    return selected.makeVirtual<Input>(Sql.SELF_TARGET)
  }

  #getSelect(base: UnionBase<any>): CompoundSelect {
    const data = get(base)
    if (!('compound' in data)) throw new Error('No compound defined')
    return data.compound as CompoundSelect
  }

  #compound(op: UnionOp, target: UnionTarget<Input, Meta>): Union<Input, Meta> {
    const left = this.#getSelect(this)
    const right = this.#getSelect(
      typeof target === 'function' ? target(this.#makeSelf()) : target
    )
    const [on, ...rest] = right
    const select = [...left, {[op]: on}, ...rest] as CompoundSelect
    return new Union({
      ...get(this),
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
  readonly [internal]: QueryData & SelectQuery & {query: Sql}

  constructor(data: QueryData & SelectQuery) {
    const compound: CompoundSelect = [data]
    const withCompound = {...data, compound}
    super(withCompound)
    this[internal] = {
      ...withCompound,
      get query() {
        return selectQuery(this as SelectQuery) as Sql<Array<SelectionRow<Input>>>
      },
      selection: querySelection(withCompound)
    }
  }

  from(from: HasTarget | Sql): Select<Input, Meta> {
    return new Select({...get(this), from})
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
      ...get(this),
      for: sql.query(sql.unsafe(keyword), {
        of:
          config.of &&
          sql.join(
            [config.of].flat().map(value => get(value).target!),
            sql`, `
          ),
        nowait: config.noWait,
        skipLocked: config.skipLocked
      })
    })
  }

  #fromTarget(): [HasTarget | Sql, ...Array<Join<HasTarget | Sql>>] {
    const {from} = get(this)
    if (!from) throw new Error('No target defined')
    if (Array.isArray(from)) return from
    return [from]
  }

  #join(join: Join<HasTarget | Sql>): Select<Input, Meta> {
    return new Select({...get(this), from: [...this.#fromTarget(), join]})
  }

  leftJoin(
    leftJoin: HasTarget | Sql,
    on: HasValue<boolean>
  ): Select<Input, Meta> {
    return this.#join({leftJoin, on})
  }

  leftJoinLateral(
    leftJoinLateral: HasTarget | Sql,
    on: HasValue<boolean>
  ): Select<Input, Meta> {
    return this.#join({leftJoinLateral, on})
  }

  rightJoin(
    rightJoin: HasTarget | Sql,
    on: HasValue<boolean>
  ): Select<Input, Meta> {
    return this.#join({rightJoin, on})
  }

  innerJoin(
    innerJoin: HasTarget | Sql,
    on: HasValue<boolean>
  ): Select<Input, Meta> {
    return this.#join({innerJoin, on})
  }

  innerJoinLateral(
    innerJoinLateral: HasTarget | Sql,
    on: HasValue<boolean>
  ): Select<Input, Meta> {
    return this.#join({innerJoinLateral, on})
  }

  fullJoin(
    fullJoin: HasTarget | Sql,
    on: HasValue<boolean>
  ): Select<Input, Meta> {
    return this.#join({fullJoin, on})
  }

  crossJoin(crossJoin: HasTarget | Sql): Select<Input, Meta> {
    return this.#join({crossJoin})
  }

  crossJoinLateral(crossJoinLateral: HasTarget | Sql): Select<Input, Meta> {
    return this.#join({crossJoinLateral})
  }

  where(...where: Array<HasValue<boolean> | undefined>): Select<Input, Meta> {
    return new Select({...get(this), where: and(...where)})
  }

  groupBy(...groupBy: Array<HasValue>): Select<Input, Meta> {
    return new Select({...get(this), groupBy})
  }

  having(
    having: HasValue<boolean> | ((self: Input) => HasValue<boolean>)
  ): Select<Input, Meta> {
    return new Select({...get(this), having: having as any})
  }

  orderBy(...orderBy: Array<HasValue>): Select<Input, Meta> {
    return new Select({...get(this), orderBy})
  }

  limit(limit: UserInput<number>): Select<Input, Meta> {
    return new Select({...get(this), limit})
  }

  offset(offset: UserInput<number>): Select<Input, Meta> {
    return new Select({...get(this), offset})
  }

  $dynamic(): this {
    return this
  }

  $first(): SelectFirst<Input, Meta> {
    return new SelectFirst(get(this))
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
> = Input extends HasValue<infer Value>
  ? Field<Value, TableName>
  : Input extends SelectionRecord
    ? Expand<{
        [K in keyof Input]: RetypeSubQueryInput<Input[K], TableName>
      }>
    : Input

export interface SelectBase<Input, Meta extends QueryMeta = QueryMeta>
  extends UnionBase<StripFieldMeta<Input>, Meta>,
    HasValue<SelectionRow<Input>> {
  for(
    keyword: (typeof forKeywords)[number],
    config?: {
      of?: HasTarget | Array<HasTarget>
      noWait?: boolean
      skipLocked?: boolean
    }
  ): Select<Input, Meta>
  where(...where: Array<HasValue<boolean> | undefined>): Select<Input, Meta>
  groupBy(...exprs: Array<HasValue>): Select<Input, Meta>
  having(having: HasValue<boolean>): Select<Input, Meta>
  orderBy(...exprs: Array<HasValue>): Select<Input, Meta>
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
    HasValue<SelectionRow<Input>> {
  from<Definition extends TableDefinition, Name extends string>(
    from: Table<Definition, Name>
  ): SelectionFrom<Input, Meta>
  from(from: HasTarget): SelectionFrom<Input, Meta>
  from(from: SubQuery<unknown>): SelectionFrom<Input, Meta>
  from(from: HasValue): Select<Input, Meta>
}

export interface AllFrom<Input, Meta extends QueryMeta, Tables = Input>
  extends SelectBase<Input, Meta> {
  leftJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasValue<boolean>
  ): AllFrom<
    Expand<Tables & MakeNullable<Record<Name, TableFields<Definition>>>>,
    Meta
  >
  leftJoin<Input, Name extends string>(
    right: SubQuery<Input, Name>,
    on: HasValue<boolean>
  ): AllFrom<Expand<Tables & MakeNullable<Record<Name, Input>>>, Meta>
  leftJoinLateral<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasValue<boolean>
  ): AllFrom<
    Expand<Tables & MakeNullable<Record<Name, TableFields<Definition>>>>,
    Meta
  >
  leftJoinLateral<Input, Name extends string>(
    right: SubQuery<Input, Name>,
    on: HasValue<boolean>
  ): AllFrom<Expand<Tables & MakeNullable<Record<Name, Input>>>, Meta>
  rightJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasValue<boolean>
  ): AllFrom<
    Expand<MakeNullable<Tables> & Record<Name, TableFields<Definition>>>,
    Meta
  >
  rightJoin<Input, Name extends string>(
    right: SubQuery<Input, Name>,
    on: HasValue<boolean>
  ): AllFrom<Expand<MakeNullable<Tables> & Record<Name, Input>>, Meta>
  innerJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasValue<boolean>
  ): AllFrom<Expand<Tables & Record<Name, TableFields<Definition>>>, Meta>
  innerJoin<Input, Name extends string>(
    right: SubQuery<Input, Name>,
    on: HasValue<boolean>
  ): AllFrom<Expand<Tables & Record<Name, Input>>, Meta>
  innerJoinLateral<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasValue<boolean>
  ): AllFrom<Expand<Tables & Record<Name, TableFields<Definition>>>, Meta>
  innerJoinLateral<Input, Name extends string>(
    right: SubQuery<Input, Name>,
    on: HasValue<boolean>
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
    on: HasValue<boolean>
  ): AllFrom<
    Expand<
      MakeNullable<Tables> & MakeNullable<Record<Name, TableFields<Definition>>>
    >,
    Meta
  >
  fullJoin<Input, Name extends string>(
    right: SubQuery<Input, Name>,
    on: HasValue<boolean>
  ): AllFrom<
    Expand<MakeNullable<Tables> & MakeNullable<Record<Name, Input>>>,
    Meta
  >
}

type MarkFieldsAsNullable<Input, TableName extends string> = Expand<{
  [K in keyof Input]: Input[K] extends Field<infer T, TableName>
    ? HasValue<T | null>
    : Input[K] extends Table<infer Definition, TableName>
      ? TableFields<Definition> & IsNullable
      : Input[K] extends Record<
            string,
            Field<unknown, TableName> | HasValue<unknown>
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
    on: HasValue<boolean>
  ): SelectionFrom<MarkFieldsAsNullable<Input, Name>, Meta>
  leftJoin<Name extends string>(
    right: HasTarget<Name>,
    on: HasValue<boolean>
  ): SelectionFrom<MarkFieldsAsNullable<Input, Name>, Meta>
  leftJoin(right: HasTarget, on: HasValue<boolean>): SelectionFrom<Input, Meta>
  leftJoinLateral<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasValue<boolean>
  ): SelectionFrom<MarkFieldsAsNullable<Input, Name>, Meta>
  leftJoinLateral<Name extends string>(
    right: HasTarget<Name>,
    on: HasValue<boolean>
  ): SelectionFrom<MarkFieldsAsNullable<Input, Name>, Meta>
  rightJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasValue<boolean>
  ): SelectionFrom<Input, Meta>
  rightJoin(right: HasTarget, on: HasValue<boolean>): SelectionFrom<Input, Meta>
  innerJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasValue<boolean>
  ): SelectionFrom<Input, Meta>
  innerJoin(right: HasTarget, on: HasValue<boolean>): SelectionFrom<Input, Meta>
  innerJoinLateral<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasValue<boolean>
  ): SelectionFrom<Input, Meta>
  innerJoinLateral(
    right: HasTarget,
    on: HasValue<boolean>
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
    on: HasValue<boolean>
  ): SelectionFrom<Input, Meta>
  fullJoin<Name extends string>(
    right: HasTarget<Name>,
    on: HasValue<boolean>
  ): SelectionFrom<MarkFieldsAsNullable<Input, Name>, Meta>
  fullJoin(right: HasTarget, on: HasValue<boolean>): SelectionFrom<Input, Meta>
}

export function querySelection({select, from}: SelectQuery): Selection {
  if (select) return selection(select as SelectionInput)
  if (!from) throw new Error('No selection defined')
  if (Array.isArray(from)) {
    const [target, ...joins] = from
    return joins.reduce((result, join) => {
      const {target, op} = joinOp(join)
      return result.join(target, op)
    }, selection(target))
  }
  return get(from).selection ?? selection(sql`*`)
}

function joinOp(join: Join) {
  const {on, ...rest} = join
  const op = Object.keys(rest)[0] as JoinOp
  const target = (<Record<string, HasTarget | Sql>>rest)[op]
  return {target, op, on}
}

function formatFrom(from: SelectQuery['from']): Sql {
  if (!from) throw new Error('No target defined')
  if (Array.isArray(from)) {
    return sql.join(
      from.map(join => {
        const joinInternal = get(join)
        if (joinInternal.target) return joinInternal.target
        if (joinInternal.value) return joinInternal.value
        const {target, op, on} = joinOp(join)
        return sql.query({
          [op]: get(target).target ?? get(target).value!,
          on
        })
      })
    )
  }
  return get(from).target ?? get(from).value!
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
  readonly [internal]: QueryData & UnionQuery & {query: Sql}

  constructor(data: QueryData & UnionQuery) {
    const compound = data.select
    const withCompound = {...data, compound}
    super(withCompound)
    this[internal] = {
      ...withCompound,
      get query() {
        return unionQuery(this as UnionQuery)
      },
      selection: querySelection(withCompound.select[0] as SelectQuery)
    }
  }

  orderBy(...orderBy: Array<HasValue>): Union<Result, Meta> {
    return new Union({...get(this), orderBy})
  }

  limit(limit: UserInput<number>): Union<Result, Meta> {
    return new Union({...get(this), limit})
  }

  offset(offset: UserInput<number>): Union<Result, Meta> {
    return new Union({...get(this), offset})
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
      for (let i = 0; i < fields.length; i++)
        if (fields[i] !== names[i])
          throw new Error('Union segments must have the same fields')
      return sql.query({[op]: selectQuery(query)})
    })
  )
  return sql.query(formatCTE(query), segments, formatModifiers(query))
}
