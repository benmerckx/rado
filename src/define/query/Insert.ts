import {ExprData} from '../Expr.js'
import {Query, QueryData} from '../Query.js'
import {Selection} from '../Selection.js'
import {Table, TableData} from '../Table.js'
import {Select} from './Select.js'

export class InsertValuesReturning<T> extends Query<T> {}

export class Inserted extends Query<{rowsAffected: number}> {
  declare [Query.Data]: QueryData.Insert

  constructor(query: QueryData.Insert) {
    super(query)
  }

  returning<X extends Selection>(
    selection: X
  ): InsertValuesReturning<Selection.Infer<X>> {
    return new InsertValuesReturning<Selection.Infer<X>>(
      new QueryData.Insert({
        ...this[Query.Data],
        selection: ExprData.create(selection)
      })
    )
  }
}

export class Insert<Definition> {
  constructor(protected into: TableData) {}

  selection(query: Select<Table.Select<Definition>>): Inserted {
    return new Inserted(
      new QueryData.Insert({into: this.into, select: query[Query.Data]})
    )
  }

  values(...data: Array<Table.Insert<Definition>>): Inserted {
    return new Inserted(new QueryData.Insert({into: this.into, data}))
  }
}
