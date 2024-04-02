import {
  type HasQuery,
  type HasSelection,
  type HasSql,
  getData,
  getQuery,
  internal
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
  readonly [internal.data]: UnionData<Meta>

  constructor(data: UnionData<Meta>) {
    super(data)
    this[internal.data] = data
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

  get [internal.selection]() {
    const {selection} = getData(this)
    if (!selection) throw new Error('todo')
    return new Selection(selection)
  }

  get [internal.query]() {
    const {left, operator, right} = getData(this)
    return sql.join([getQuery(left), operator, getQuery(right)])
  }
}
