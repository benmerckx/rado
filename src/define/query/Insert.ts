import {ExprData} from '../Expr.js'
import {Query, QueryData} from '../Query.js'
import {Selection} from '../Selection.js'
import {Table, TableData} from '../Table.js'
import {Select} from './Select.js'

export class Insert<T = {rowsAffected: number}> extends Query<T> {
  declare [Query.Data]: QueryData.Insert

  constructor(query: QueryData.Insert) {
    super(query)
  }

  returning<X extends Selection>(
    selection: X
  ): Insert<Array<Selection.Infer<X>>> {
    return new Insert<Array<Selection.Infer<X>>>(
      new QueryData.Insert({
        ...this[Query.Data],
        selection: ExprData.create(selection)
      })
    )
  }
}

export class InsertOne<T> extends Query<T> {
  declare [Query.Data]: QueryData.Insert

  constructor(query: QueryData.Insert) {
    super(query)
  }

  returning<X extends Selection>(selection: X): Insert<Selection.Infer<X>> {
    return new Insert<Selection.Infer<X>>(
      new QueryData.Insert({
        ...this[Query.Data],
        selection: ExprData.create(selection),
        singleResult: true
      })
    )
  }
}

export class InsertInto<Definition> {
  constructor(protected into: TableData) {}

  selection(query: Select<Table.Select<Definition>>): Insert {
    return new Insert(
      new QueryData.Insert({into: this.into, select: query[Query.Data]})
    )
  }

  values(...data: Array<Table.Insert<Definition>>): Insert {
    return new Insert(new QueryData.Insert({into: this.into, data}))
  }
}
