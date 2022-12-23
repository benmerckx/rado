import {Collection, CollectionData} from './Collection'
import {EV, Expr, ExprData} from './Expr'
import {OrderBy} from './OrderBy'
import {Query} from './Query'
import {Selection} from './Selection'
import {Target} from './Target'
import {Update as UpdateSet} from './Update'

export class Cursor<T> {
  // Not sure what the correct way to circumvent this is
  // https://github.com/Microsoft/TypeScript/wiki/FAQ#why-doesnt-type-inference-work-on-this-interface-interface-foot--
  private declare __type: T

  constructor(query: Query<T>) {
    Object.defineProperty(this, 'query', {
      enumerable: false,
      value: () => query
    })
  }

  query(): Query<T> {
    throw new Error('Not implemented')
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
      const condition = where
        .map(Expr.create)
        .reduce((condition, expr) => condition.and(expr), Expr.value(true))
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

  export class InsertValues extends Cursor<{rowsAffected: number}> {}

  export class Insert<T> {
    constructor(protected into: CollectionData) {}

    values(...data: Array<T>): InsertValues {
      return new InsertValues(Query.Insert({into: this.into, data}))
    }
  }

  export class Create extends Cursor<void> {
    constructor(protected collection: CollectionData) {
      super(Query.CreateTable({collection}))
    }
  }

  export class Batch extends Cursor<void> {
    constructor(protected queries: Array<Query>) {
      super(Query.Batch({queries}))
    }
  }

  export class SelectMultiple<T> extends Filterable<Array<T>> {
    query(): Query.Select {
      return super.query() as Query.Select
    }

    leftJoin<C>(that: Collection<C>, on: Expr<boolean>): SelectMultiple<T> {
      const query = this.query()
      return new SelectMultiple<T>({
        ...query,
        from: Target.Join(
          query.from,
          Target.Collection(that.data()),
          'left',
          on.expr
        )
      })
    }

    innerJoin<C>(that: Collection<C>, on: Expr<boolean>): SelectMultiple<T> {
      const query = this.query()
      return new SelectMultiple<T>({
        ...query,
        from: Target.Join(
          query.from,
          Target.Collection(that.data()),
          'inner',
          on.expr
        )
      })
    }

    select<X extends Selection>(
      selection: X
    ): SelectMultiple<Selection.Infer<X>> {
      return new SelectMultiple<Selection.Infer<X>>({
        ...this.query(),
        selection: ExprData.create(selection)
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

    first(): SelectSingle<T> {
      return new SelectSingle<T>({...this.query(), singleResult: true})
    }
  }

  export class SelectSingle<T> extends Filterable<T | null> {
    query(): Query.Select {
      return super.query() as Query.Select
    }

    leftJoin<C>(that: Collection<C>, on: Expr<boolean>): SelectSingle<T> {
      const query = this.query()
      return new SelectSingle<T>({
        ...query,
        from: Target.Join(
          query.from,
          Target.Collection(that.data()),
          'left',
          on.expr
        )
      })
    }

    innerJoin<C>(that: Collection<C>, on: Expr<boolean>): SelectSingle<T> {
      const query = this.query()
      return new SelectSingle<T>({
        ...query,
        from: Target.Join(
          query.from,
          Target.Collection(that.data()),
          'inner',
          on.expr
        )
      })
    }

    select<X extends Selection>(
      selection: X
    ): SelectSingle<Selection.Infer<X>> {
      return new SelectSingle<Selection.Infer<X>>({
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
  }
}
