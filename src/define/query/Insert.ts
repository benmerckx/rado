import {ExprData} from '../Expr'
import {Query, QueryData} from '../Query'
import {Selection} from '../Selection'
import {Table, TableData} from '../Table'
import {Select} from './Select'

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
