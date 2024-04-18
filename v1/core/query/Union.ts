import {
  getData,
  internalData,
  internalQuery,
  internalSelection,
  type HasQuery,
  type HasSelection,
  type HasSql
} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import {Query, QueryData} from '../Query.ts'
import type {Selection} from '../Selection.ts'
import {sql} from '../Sql.ts'
import type {Select} from './Select.ts'

export class UnionData<Meta extends QueryMeta> extends QueryData<Meta> {
  selection!: Selection
  left!: HasQuery
  operator!: HasSql
  right!: HasQuery
}

export class Union<Result, Meta extends QueryMeta = QueryMeta>
  extends Query<Result, Meta>
  implements HasSelection
{
  readonly [internalData]: UnionData<Meta>;
  readonly [internalSelection]: Selection

  constructor(data: UnionData<Meta>) {
    super(data)
    this[internalData] = data
    this[internalSelection] = data.selection
  }

  union(right: Select.SelectBase<Result, Meta>): Union<Result, Meta> {
    return new Union<Result, Meta>({
      ...getData(this),
      left: this,
      operator: sql`union`,
      right
    })
  }

  unionAll(right: Select.SelectBase<Result, Meta>): Union<Result, Meta> {
    return new Union<Result, Meta>({
      ...getData(this),
      left: this,
      operator: sql`union all`,
      right
    })
  }

  intersect(right: Select.SelectBase<Result, Meta>): Union<Result, Meta> {
    return new Union<Result, Meta>({
      ...getData(this),
      left: this,
      operator: sql`intersect`,
      right
    })
  }

  except(right: Select.SelectBase<Result, Meta>): Union<Result, Meta> {
    return new Union<Result, Meta>({
      ...getData(this),
      left: this,
      operator: sql`except`,
      right
    })
  }

  get [internalQuery]() {
    return sql.chunk('emitUnion', this)
  }
}
