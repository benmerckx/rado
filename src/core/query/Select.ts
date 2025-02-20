import {
  type HasSelection,
  type HasSql,
  type HasTarget,
  getData,
  getQuery,
  getSelection,
  getSql,
  getTarget,
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
import {and} from '../expr/Conditions.ts'
import type {Field} from '../expr/Field.ts'
import {type Input as UserInput, input} from '../expr/Input.ts'
import {formatCTE} from './CTE.ts'
import type {
  CompoundSelect,
  Join,
  JoinOp,
  SelectQuery,
  UnionOp,
  UnionQuery
} from './Query.ts'

type UnionTarget<Input, Meta extends QueryMeta> =
  | UnionBase<Input, Meta>
  | ((self: Input & HasTarget) => UnionBase<Input, Meta>)

export abstract class UnionBase<Input, Meta extends QueryMeta = QueryMeta>
  extends SingleQuery<SelectionRow<Input>, Meta>
  implements HasSelection
{
  readonly [internalData]: QueryData<Meta>
  abstract [internalSelection]: Selection

  constructor(data: QueryData<Meta> & {compound: CompoundSelect}) {
    super(data)
    this[internalData] = data
  }

  as<Name extends string>(alias: Name): SubQuery<Input, Name> {
    const fields = getSelection(this).makeVirtual(alias)
    return Object.assign(<any>fields, {
      [internalTarget]: sql`(${getQuery(this)}) as ${sql.identifier(
        alias
      )}`.inlineFields(true)
    })
  }

  #makeSelf(): Input & HasTarget {
    const selected = getSelection(this)
    return selected.makeVirtual(Sql.SELF_TARGET)
  }

  #getSelect(base: UnionBase<any>): CompoundSelect {
    const data = getData(base)
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
      ...this,
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

export class Select<Input, Meta extends QueryMeta = QueryMeta>
  extends UnionBase<Input, Meta>
  implements HasSelection, SelectBase<Input, Meta>
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

  #fromTarget(): [HasTarget | Sql, ...Array<Join<HasTarget | Sql>>] {
    const {from} = getData(this)
    if (!from) throw new Error('No target defined')
    if (Array.isArray(from)) return from
    if (!hasTarget(from)) throw new Error('No target defined')
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

  fullJoin(
    fullJoin: HasTarget | Sql,
    on: HasSql<boolean>
  ): Select<Input, Meta> {
    return this.#join({fullJoin, on})
  }

  crossJoin(
    crossJoin: HasTarget | Sql,
    on: HasSql<boolean>
  ): Select<Input, Meta> {
    return this.#join({crossJoin, on})
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

  $first(): Select<Input, Meta> {
    return new Select({...getData(this), first: true})
  }

  get [internalSelection](): Selection {
    return querySelection(getData(this))
  }

  get [internalQuery](): Sql {
    return selectQuery(getData(this))
  }

  get [internalSql](): Sql<SelectionRow<Input>> {
    return sql`(${getQuery(this)})`
  }
}

export type SubQuery<Input, Name extends string = string> = Input &
  HasTarget<Name>

export interface SelectBase<Input, Meta extends QueryMeta = QueryMeta>
  extends UnionBase<Input, Meta>,
    HasSql<SelectionRow<Input>> {
  where(...where: Array<HasSql<boolean> | undefined>): Select<Input, Meta>
  groupBy(...exprs: Array<HasSql>): Select<Input, Meta>
  having(having: HasSql<boolean>): Select<Input, Meta>
  orderBy(...exprs: Array<HasSql>): Select<Input, Meta>
  limit(limit: UserInput<number>): Select<Input, Meta>
  offset(offset: UserInput<number>): Select<Input, Meta>
  as<Name extends string>(name: Name): SubQuery<Input, Name>
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
}

export interface WithSelection<Input, Meta extends QueryMeta>
  extends SelectBase<Input, Meta>,
    HasSql<SelectionRow<Input>> {
  from<Definition extends TableDefinition, Name extends string>(
    from: Table<Definition, Name>
  ): SelectionFrom<Input, Meta>
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
  leftJoin(right: HasTarget, on: HasSql<boolean>): SelectionFrom<Input, Meta>
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
  crossJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): SelectionFrom<Input, Meta>
  crossJoin(right: HasTarget, on: HasSql<boolean>): SelectionFrom<Input, Meta>
  fullJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): SelectionFrom<Input, Meta>
  fullJoin(right: HasTarget, on: HasSql<boolean>): SelectionFrom<Input, Meta>
}

export function querySelection({select, from}: SelectQuery): Selection {
  if (select) return selection(select as SelectionInput)
  if (!from) throw new Error('No selection defined')
  if (Array.isArray(from)) {
    const [target, ...joins] = from
    let result = selection(target)
    for (const join of joins) {
      const {target, op} = joinOp(join)
      result = result.join(target, op)
    }
    return result
  }
  return hasTable(from) ? selection(from) : selection(sql`*`)
}

function joinOp(join: Join) {
  const {on, ...rest} = join
  const op = Object.keys(rest)[0] as JoinOp
  const target = (<Record<string, HasTarget>>rest)[op]
  return {target, op, on}
}

function formatFrom(from: SelectQuery['from']): Sql {
  if (!from) throw new Error('No target defined')
  if (Array.isArray(from)) {
    return sql.join(
      from.map(join => {
        if (hasTarget(join)) return getTarget(join)
        if (hasSql(join)) return getSql(join)
        const {target, op, on} = joinOp(join)
        return sql.query({[op]: getTarget(target), on})
      })
    )
  }
  return hasTarget(from) ? getTarget(from) : getSql(from)
}

export function selectQuery(query: SelectQuery): Sql {
  const {
    from,
    where,
    groupBy,
    orderBy,
    having,
    limit,
    offset,
    distinct,
    distinctOn
  } = query
  const prefix = distinctOn
    ? sql`distinct on (${sql.join(distinctOn, sql`, `)})`
    : distinct && sql`distinct`
  const selected = querySelection(query)
  const select = sql.join([prefix, selected])

  return sql.query(formatCTE(query), {
    select,
    from: from && formatFrom(from),
    where,
    groupBy: groupBy && sql.join(groupBy, sql`, `),
    having: typeof having === 'function' ? having(selected.input) : having,
    orderBy: orderBy && sql.join(orderBy, sql`, `),
    limit: limit !== undefined && input(limit),
    offset: offset !== undefined && input(offset)
  })
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
    if (!first.select) throw new Error('No selection defined')
    return selection(first.select)
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
  const {select, orderBy, limit, offset} = query
  const segments = sql.join(
    select.map((segment, i) => {
      if (i === 0) return selectQuery(segment as SelectQuery)
      const op = Object.keys(segment)[0] as UnionOp
      const query = (<Record<UnionOp, SelectQuery>>segment)[op]
      return sql.query({[op]: selectQuery(query)})
    })
  )
  return sql.query(formatCTE(query), segments, {
    orderBy: orderBy && sql.join(orderBy, sql`, `),
    limit: limit !== undefined && input(limit),
    offset: offset !== undefined && input(offset)
  })
}
