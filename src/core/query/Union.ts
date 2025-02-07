import {
  type HasSelection,
  type HasTarget,
  getData,
  getSelection,
  internalData,
  internalQuery,
  internalSelection
} from '../Internal.ts'
import type {IsMysql, IsPostgres, QueryMeta} from '../MetaData.ts'
import {Query, type QueryData} from '../Query.ts'
import {type Selection, type SelectionRow, selection} from '../Selection.ts'
import {Sql, sql} from '../Sql.ts'
import {input} from '../expr/Input.ts'
import {withCTE} from './CTE.ts'
import type {CompoundSelect, SelectQuery, UnionOp, UnionQuery} from './Query.ts'
import {selectQuery} from './Select.ts'

type UnionTarget<Input, Meta extends QueryMeta> =
  | UnionBase<Input, Meta>
  | ((self: Input & HasTarget) => UnionBase<Input, Meta>)

export abstract class UnionBase<Input, Meta extends QueryMeta = QueryMeta>
  extends Query<SelectionRow<Input>, Meta>
  implements HasSelection
{
  readonly [internalData]: QueryData<Meta>
  abstract [internalSelection]: Selection

  constructor(data: QueryData<Meta> & {compound: CompoundSelect}) {
    super(data)
    this[internalData] = data
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
      ...self,
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
  right: UnionBase<Result, Meta>
): Union<Result, Meta> {
  return left.unionAll(right)
}

export function intersect<Result, Meta extends QueryMeta>(
  left: UnionBase<Result, Meta>,
  right: UnionBase<Result, Meta>
): Union<Result, Meta> {
  return left.intersect(right)
}

export function intersectAll<Result, Meta extends IsPostgres | IsMysql>(
  left: UnionBase<Result, Meta>,
  right: UnionBase<Result, Meta>
): Union<Result, Meta> {
  return left.intersectAll(right)
}

export function except<Result, Meta extends QueryMeta>(
  left: UnionBase<Result, Meta>,
  right: UnionBase<Result, Meta>
): Union<Result, Meta> {
  return left.except(right)
}

export function exceptAll<Result, Meta extends IsPostgres | IsMysql>(
  left: UnionBase<Result, Meta>,
  right: UnionBase<Result, Meta>
): Union<Result, Meta> {
  return left.exceptAll(right)
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
  return withCTE(
    query,
    sql.query({
      '': segments,
      orderBy: orderBy && sql.join(orderBy, sql`, `),
      limit: limit !== undefined && input(limit),
      offset: offset !== undefined && input(offset)
    })
  )
}
