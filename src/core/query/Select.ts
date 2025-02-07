import {
  type HasSelection,
  type HasSql,
  type HasTarget,
  getData,
  getQuery,
  getSelection,
  getSql,
  getTarget,
  hasTable,
  hasTarget,
  internalData,
  internalQuery,
  internalSelection,
  internalSql,
  internalTarget
} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import type {QueryData} from '../Query.ts'
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
import {withCTE} from './CTE.ts'
import type {Join, JoinOp, SelectQuery} from './Query.ts'
import {UnionBase} from './Union.ts'

export class Select<Input, Meta extends QueryMeta = QueryMeta>
  extends UnionBase<Input, Meta>
  implements HasSelection, SelectBase<Input, Meta>
{
  readonly [internalData]: QueryData<Meta> & SelectQuery

  constructor(data: QueryData<Meta> & SelectQuery) {
    super(data)
    this[internalData] = data
  }

  as(alias: string): SubQuery<Input> {
    const fields = getSelection(this).makeVirtual(alias)
    return Object.assign(<any>fields, {
      [internalTarget]: sql`(${getQuery(this)}) as ${sql.identifier(
        alias
      )}`.inlineFields(true)
    })
  }

  from(target: HasTarget | HasSql): Select<Input, Meta> {
    const {select: current} = getData(this)
    const from = hasTarget(target) ? getTarget(target) : getSql(target)
    const isTable = hasTable(target)
    const selected = current ?? (isTable ? target : sql`*`)
    return new Select({
      ...getData(this),
      select: selected,
      from
    })
  }

  #fromTarget(): [HasTarget, ...Array<Join>] {
    const {from} = getData(this)
    if (!from) throw new Error('No target defined')
    if (!hasTarget(from)) throw new Error('No target defined')
    return Array.isArray(from) ? (from as any) : [from]
  }

  #join(join: Join): Select<Input, Meta> {
    const {select} = getData(this)
    const {op, target} = joinOp(join)
    const current = select ? selection(select) : undefined
    return new Select({
      ...getData(this),
      select: hasTable(target) ? current?.join(target, op) : current,
      from: [...this.#fromTarget(), join]
    })
  }

  leftJoin(leftJoin: HasTarget, on: HasSql<boolean>): Select<Input, Meta> {
    return this.#join({leftJoin, on})
  }

  rightJoin(rightJoin: HasTarget, on: HasSql<boolean>): Select<Input, Meta> {
    return this.#join({rightJoin, on})
  }

  innerJoin(innerJoin: HasTarget, on: HasSql<boolean>): Select<Input, Meta> {
    return this.#join({innerJoin, on})
  }

  fullJoin(fullJoin: HasTarget, on: HasSql<boolean>): Select<Input, Meta> {
    return this.#join({fullJoin, on})
  }

  where(...where: Array<HasSql<boolean> | undefined>): Select<Input, Meta> {
    return new Select({...getData(this), where: and(...where)})
  }

  groupBy(...groupBy: Array<HasSql>): Select<Input, Meta> {
    return new Select({
      ...getData(this),
      groupBy
    })
  }

  having(
    having: HasSql<boolean> | ((self: Input) => HasSql<boolean>)
  ): Select<Input, Meta> {
    return new Select({
      ...getData(this),
      having: having as any
    })
  }

  orderBy(...orderBy: Array<HasSql>): Select<Input, Meta> {
    return new Select({
      ...getData(this),
      orderBy
    })
  }

  limit(limit: UserInput<number>): Select<Input, Meta> {
    return new Select({...getData(this), limit})
  }

  offset(offset: UserInput<number>): Select<Input, Meta> {
    return new Select({
      ...getData(this),
      offset
    })
  }

  get [internalSelection](): Selection {
    const {select} = getData(this)
    if (!select) throw new Error('No selection defined')
    return selection(select)
  }

  get [internalQuery](): Sql {
    return new Sql(emitter => emitter.emitSelect(getData(this)))
  }

  get [internalSql](): Sql<SelectionRow<Input>> {
    return sql`(${getQuery(this)})`
  }
}

export type SubQuery<Input> = Input & HasTarget

export interface SelectBase<Input, Meta extends QueryMeta = QueryMeta>
  extends UnionBase<Input, Meta>,
    HasSelection,
    HasSql<SelectionRow<Input>> {
  where(...where: Array<HasSql<boolean> | undefined>): Select<Input, Meta>
  groupBy(...exprs: Array<HasSql>): Select<Input, Meta>
  having(having: HasSql<boolean>): Select<Input, Meta>
  orderBy(...exprs: Array<HasSql>): Select<Input, Meta>
  limit(limit: UserInput<number>): Select<Input, Meta>
  offset(offset: UserInput<number>): Select<Input, Meta>
  as(name: string): SubQuery<Input>
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
  from(target: HasSql): Select<Input, Meta>
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
  rightJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): AllFrom<
    Expand<MakeNullable<Tables> & Record<Name, TableFields<Definition>>>,
    Meta
  >
  innerJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): AllFrom<Expand<Tables & Record<Name, TableFields<Definition>>>, Meta>
  fullJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): AllFrom<
    Expand<
      MakeNullable<Tables> & MakeNullable<Record<Name, TableFields<Definition>>>
    >,
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
  fullJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): SelectionFrom<Input, Meta>
  fullJoin(right: HasTarget, on: HasSql<boolean>): SelectionFrom<Input, Meta>
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
        const {target, op, on} = joinOp(join)
        return sql.query({[op]: getTarget(target), on})
      })
    )
  }
  return hasTarget(from) ? getTarget(from) : getSql(from)
}

export function selectQuery(query: SelectQuery): Sql {
  const {
    select: selected,
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
  const select = selected ? sql.join([prefix, selection(selected)]) : sql`*`

  return withCTE(
    query,
    sql.query({
      select,
      from: formatFrom(from),
      where,
      groupBy: groupBy && sql.join(groupBy, sql`, `),
      orderBy: orderBy && sql.join(orderBy, sql`, `),
      having:
        typeof having === 'function'
          ? having(selected as SelectionInput)
          : having,
      limit: limit !== undefined && input(limit),
      offset: offset !== undefined && input(offset)
    })
  )
}
