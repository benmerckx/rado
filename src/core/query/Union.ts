import {
  getData,
  internalData,
  internalQuery,
  internalSelection,
  type HasQuery,
  type HasSelection,
  type HasSql
} from '../Internal.ts'
import type {IsMysql, IsPostgres, QueryMeta} from '../MetaData.ts'
import {Query, type QueryData} from '../Query.ts'
import type {Selection, SelectionRow} from '../Selection.ts'
import {sql, type Sql} from '../Sql.ts'

export interface UnionBaseData<Meta extends QueryMeta> extends QueryData<Meta> {
  selection?: Selection
}

export abstract class UnionBase<
  Input,
  Meta extends QueryMeta = QueryMeta
> extends Query<SelectionRow<Input>, Meta> {
  readonly [internalData]!: UnionBaseData<Meta>

  union(right: UnionBase<Input, Meta>): Union<Input, Meta> {
    return new Union<Input, Meta>({
      ...getData(this),
      left: this,
      operator: sql`union`,
      right
    })
  }

  unionAll(
    right: UnionBase<Input, Meta> | ((self: Input) => UnionBase<Input, Meta>)
  ): Union<Input, Meta> {
    return new Union<Input, Meta>({
      ...getData(this),
      left: this,
      operator: sql`union all`,
      right:
        typeof right === 'function'
          ? right(getData(this).selection?.input as Input)
          : right
    })
  }

  intersect(right: UnionBase<Input, Meta>): Union<Input, Meta> {
    return new Union<Input, Meta>({
      ...getData(this),
      left: this,
      operator: sql`intersect`,
      right
    })
  }

  intersectAll(
    this: UnionBase<Input, IsPostgres | IsMysql>,
    right: UnionBase<Input, Meta>
  ): Union<Input, Meta> {
    return new Union<Input, Meta>({
      ...getData(this as UnionBase<Input, Meta>),
      left: this,
      operator: sql`intersect all`,
      right
    })
  }

  except(right: UnionBase<Input, Meta>): Union<Input, Meta> {
    return new Union<Input, Meta>({
      ...getData(this),
      left: this,
      operator: sql`except`,
      right
    })
  }

  exceptAll(
    this: UnionBase<Input, IsPostgres | IsMysql>,
    right: UnionBase<Input, Meta>
  ): Union<Input, Meta> {
    return new Union<Input, Meta>({
      ...getData(this as UnionBase<Input, Meta>),
      left: this,
      operator: sql`except all`,
      right
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
    this[internalSelection] = data.selection!
  }

  get [internalQuery](): Sql {
    return sql.chunk('emitUnion', getData(this))
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
