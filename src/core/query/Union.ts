import {
  type HasQuery,
  type HasSelection,
  type HasSql,
  type HasTarget,
  getData,
  internalData,
  internalQuery,
  internalSelection
} from '../Internal.ts'
import type {IsMysql, IsPostgres, QueryMeta} from '../MetaData.ts'
import {Query, type QueryData} from '../Query.ts'
import type {Selection, SelectionRow} from '../Selection.ts'
import {Sql, sql} from '../Sql.ts'

export interface UnionBaseData<Meta extends QueryMeta> extends QueryData<Meta> {
  select?: Selection
}

export abstract class UnionBase<
  Input,
  Meta extends QueryMeta = QueryMeta
> extends Query<SelectionRow<Input>, Meta> {
  readonly [internalData]!: UnionBaseData<Meta>

  #makeSelf(): Input & HasTarget {
    const {select} = getData(this)
    return select!.makeVirtual(Sql.SELF_TARGET)
  }

  union(
    right:
      | UnionBase<Input, Meta>
      | ((self: Input & HasTarget) => UnionBase<Input, Meta>)
  ): Union<Input, Meta> {
    return new Union<Input, Meta>({
      ...getData(this),
      left: this,
      operator: sql`union`,
      right: typeof right === 'function' ? right(this.#makeSelf()) : right
    })
  }

  unionAll(
    right:
      | UnionBase<Input, Meta>
      | ((self: Input & HasTarget) => UnionBase<Input, Meta>)
  ): Union<Input, Meta> {
    return new Union<Input, Meta>({
      ...getData(this),
      left: this,
      operator: sql`union all`,
      right: typeof right === 'function' ? right(this.#makeSelf()) : right
    })
  }

  intersect(
    right:
      | UnionBase<Input, Meta>
      | ((self: Input & HasTarget) => UnionBase<Input, Meta>)
  ): Union<Input, Meta> {
    return new Union<Input, Meta>({
      ...getData(this),
      left: this,
      operator: sql`intersect`,
      right: typeof right === 'function' ? right(this.#makeSelf()) : right
    })
  }

  intersectAll(
    this: UnionBase<Input, IsPostgres | IsMysql>,
    right:
      | UnionBase<Input, Meta>
      | ((self: Input & HasTarget) => UnionBase<Input, Meta>)
  ): Union<Input, Meta> {
    return new Union<Input, Meta>({
      ...getData(this as UnionBase<Input, Meta>),
      left: this,
      operator: sql`intersect all`,
      right: typeof right === 'function' ? right(this.#makeSelf()) : right
    })
  }

  except(
    right:
      | UnionBase<Input, Meta>
      | ((self: Input & HasTarget) => UnionBase<Input, Meta>)
  ): Union<Input, Meta> {
    return new Union<Input, Meta>({
      ...getData(this),
      left: this,
      operator: sql`except`,
      right: typeof right === 'function' ? right(this.#makeSelf()) : right
    })
  }

  exceptAll(
    this: UnionBase<Input, IsPostgres | IsMysql>,
    right:
      | UnionBase<Input, Meta>
      | ((self: Input & HasTarget) => UnionBase<Input, Meta>)
  ): Union<Input, Meta> {
    return new Union<Input, Meta>({
      ...getData(this as UnionBase<Input, Meta>),
      left: this,
      operator: sql`except all`,
      right: typeof right === 'function' ? right(this.#makeSelf()) : right
    })
  }
}

export interface UnionData<Meta extends QueryMeta = QueryMeta>
  extends UnionBaseData<Meta> {
  left: HasQuery
  operator: HasSql
  right: HasQuery
}

export class Union<Result, Meta extends QueryMeta = QueryMeta>
  extends UnionBase<Result, Meta>
  implements HasSelection
{
  readonly [internalData]: UnionData<Meta>
  readonly [internalSelection]: Selection

  constructor(data: UnionData<Meta>) {
    super(data)
    this[internalData] = data
    this[internalSelection] = data.select!
  }

  get [internalQuery](): Sql {
    return new Sql(emitter => emitter.emitUnion(getData(this)))
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

export function unionQuery(query: UnionQuery) {
  return sql.join([getQuery(left), operator, getQuery(right)]).emit(this)
}
