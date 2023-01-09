import {EV, Expr, ExprData} from './Expr'
import {Functions} from './Functions'
import {OrderBy} from './OrderBy'
import {Query} from './Query'
import {Schema} from './Schema'
import {Selection} from './Selection'
import {Table} from './Table'
import {Target} from './Target'
import {Update as UpdateSet} from './Update'

export class Cursor<T> {
  /** @internal */
  protected declare __cursorType: T

  constructor(query: Query<T>) {
    Object.defineProperty(this, 'query', {
      enumerable: false,
      value: () => query
    })
  }

  query(): Query<T> {
    throw new Error('Not implemented')
  }

  toJSON(): Query<T> {
    return this.query()
  }
}

export namespace Cursor {
  export class Limitable<T> extends Cursor<T> {
    take(limit: number | undefined): Limitable<T> {
      return new Limitable({...this.query(), limit})
    }

    skip(offset: number | undefined): Limitable<T> {
      return new Limitable({...this.query(), offset})
    }
  }

  export class Filterable<T> extends Limitable<T> {
    where(...where: Array<EV<boolean>>): Filterable<T> {
      const condition = Expr.and(...where)
      const query = this.query()
      return new Filterable({
        ...query,
        where: (query.where ? condition.and(new Expr(query.where)) : condition)
          .expr
      })
    }
  }

  export class Delete<T> extends Filterable<{rowsAffected: number}> {
    query(): Query.Delete {
      return super.query() as Query.Delete
    }
  }

  export class Update<T> extends Filterable<{rowsAffected: number}> {
    declare query: () => Query.Update

    set(set: UpdateSet<T>): Update<T> {
      return new Update({...this.query(), set})
    }
  }

  export class InsertValuesReturning<T> extends Cursor<T> {}

  export class InsertValues extends Cursor<{rowsAffected: number}> {
    query(): Query.Insert {
      return super.query() as Query.Insert
    }

    returning<X extends Selection>(
      selection: X
    ): InsertValuesReturning<Selection.Infer<X>> {
      return new InsertValuesReturning<Selection.Infer<X>>(
        Query.Insert({...this.query(), selection: ExprData.create(selection)})
      )
    }
  }

  export class Insert<T> {
    constructor(protected into: Schema) {}

    values(...data: Array<Table.Insert<T>>): InsertValues {
      return new InsertValues(Query.Insert({into: this.into, data}))
    }
  }

  export class Create extends Cursor<void> {
    constructor(protected table: Schema) {
      super(Query.CreateTable({table, ifNotExists: true}))
    }
  }

  export class Batch<T = void> extends Cursor<T> {
    constructor(protected queries: Array<Query>) {
      super(Query.Batch({queries}))
    }
  }

  export class SelectMultiple<T> extends Filterable<Array<T>> {
    query(): Query.Select {
      return super.query() as Query.Select
    }

    leftJoin<C>(that: Table<C>, ...on: Array<EV<boolean>>): SelectMultiple<T> {
      const query = this.query()
      return new SelectMultiple({
        ...query,
        from: Target.Join(
          query.from,
          Target.Table(that.schema()),
          'left',
          Expr.and(...on).expr
        )
      })
    }

    innerJoin<C>(that: Table<C>, ...on: Array<EV<boolean>>): SelectMultiple<T> {
      const query = this.query()
      return new SelectMultiple({
        ...query,
        from: Target.Join(
          query.from,
          Target.Table(that.schema()),
          'inner',
          Expr.and(...on).expr
        )
      })
    }

    select<X extends Selection>(
      selection: X
    ): SelectMultiple<Selection.Infer<X>> {
      return new SelectMultiple({
        ...this.query(),
        selection: ExprData.create(selection)
      })
    }

    count(): SelectSingle<number> {
      return new SelectSingle({
        ...this.query(),
        selection: Functions.count().expr,
        singleResult: true
      })
    }

    orderBy(...orderBy: Array<OrderBy>): SelectMultiple<T> {
      return new SelectMultiple({
        ...this.query(),
        orderBy
      })
    }

    groupBy(...groupBy: Array<Expr<any>>): SelectMultiple<T> {
      return new SelectMultiple({
        ...this.query(),
        groupBy: groupBy.map(ExprData.create)
      })
    }

    first(): SelectSingle<T | undefined> {
      return new SelectSingle({...this.query(), singleResult: true})
    }

    where(...where: Array<EV<boolean>>): SelectMultiple<T> {
      return new SelectMultiple(super.where(...where).query())
    }

    toExpr(): Expr<T> {
      return new Expr<T>(ExprData.Query(this.query()))
    }
  }

  export class SelectSingle<T> extends Filterable<T> {
    query(): Query.Select {
      return super.query() as Query.Select
    }

    leftJoin<C>(that: Table<C>, ...on: Array<EV<boolean>>): SelectSingle<T> {
      const query = this.query()
      return new SelectSingle({
        ...query,
        from: Target.Join(
          query.from,
          Target.Table(that.schema()),
          'left',
          Expr.and(...on).expr
        )
      })
    }

    innerJoin<C>(that: Table<C>, ...on: Array<EV<boolean>>): SelectSingle<T> {
      const query = this.query()
      return new SelectSingle({
        ...query,
        from: Target.Join(
          query.from,
          Target.Table(that.schema()),
          'inner',
          Expr.and(...on).expr
        )
      })
    }

    select<X extends Selection>(
      selection: X
    ): SelectSingle<Selection.Infer<X>> {
      return new SelectSingle({
        ...this.query(),
        selection: ExprData.create(selection)
      })
    }

    orderBy(...orderBy: Array<OrderBy>): SelectSingle<T> {
      return new SelectSingle({
        ...this.query(),
        orderBy
      })
    }

    groupBy(...groupBy: Array<Expr<any>>): SelectSingle<T> {
      return new SelectSingle({
        ...this.query(),
        groupBy: groupBy.map(ExprData.create)
      })
    }

    where(...where: Array<EV<boolean>>): SelectSingle<T> {
      return new SelectSingle(super.where(...where).query())
    }

    toExpr(): Expr<T> {
      return new Expr<T>(ExprData.Query(this.query()))
    }
  }
}
