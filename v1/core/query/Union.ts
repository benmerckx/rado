import {
  type HasQuery,
  type HasSelection,
  type HasSql,
  getData,
  getQuery,
  internalData,
  internalQuery,
  internalSelection
} from '../Internal.ts'
import {Query, QueryData, type QueryMeta} from '../Query.ts'
import {Selection, type SelectionInput} from '../Selection.ts'
import {sql} from '../Sql.ts'
import type {Select} from './Select.ts'

class UnionData<Meta extends QueryMeta> extends QueryData<Meta> {
  selection?: SelectionInput
  left!: HasQuery
  operator!: HasSql
  right!: HasQuery
}

export class Union<Result, Meta extends QueryMeta>
  extends Query<Result, Meta>
  implements HasSelection
{
  readonly [internalData]: UnionData<Meta>

  constructor(data: UnionData<Meta>) {
    super(data)
    this[internalData] = data
  }

  union(
    right: Select<Result, Meta> | Union<Result, Meta>
  ): Union<Result, Meta> {
    return new Union<Result, Meta>({
      ...getData(this),
      left: this,
      operator: sql`union`,
      right
    })
  }

  unionAll(right: Select<Result, Meta>): Union<Result, Meta> {
    return new Union<Result, Meta>({
      ...getData(this),
      left: this,
      operator: sql`union all`,
      right
    })
  }

  intersect(right: Select<Result, Meta>): Union<Result, Meta> {
    return new Union<Result, Meta>({
      ...getData(this),
      left: this,
      operator: sql`intersect`,
      right
    })
  }

  except(right: Select<Result, Meta>): Union<Result, Meta> {
    return new Union<Result, Meta>({
      ...getData(this),
      left: this,
      operator: sql`except`,
      right
    })
  }

  get [internalSelection]() {
    const {selection} = getData(this)
    if (!selection) throw new Error('todo')
    return new Selection(selection)
  }

  get [internalQuery]() {
    const {left, operator, right} = getData(this)
    return sql.join([getQuery(left), operator, getQuery(right)])
  }
}
