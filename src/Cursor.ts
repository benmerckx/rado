import {Collection, CollectionData} from './Collection'
import {EV, Expr, ExprData} from './Expr'
import {OrderBy} from './OrderBy'
import {Query} from './Query'
import {Selection} from './Selection'
import {Target} from './Target'
import {Update as UpdateSet} from './Update'

export class Cursor<T> {
  constructor(protected query: Query<T>) {}
}

export namespace Cursor {
  export class Limitable<T> extends Cursor<T> {
    take(limit: number | undefined): Limitable<T> {
      return new Limitable({...this.query, limit})
    }

    skip(offset: number | undefined): Limitable<T> {
      return new Limitable({...this.query, offset})
    }
  }

  export class Filterable<T> extends Limitable<T> {
    where(...where: Array<EV<boolean>>): Filterable<T> {
      const condition = where
        .map(Expr.create)
        .reduce((condition, expr) => condition.and(expr), Expr.value(true))
      return new Filterable({
        ...this.query,
        where: (this.query.where
          ? condition.and(new Expr(this.query.where))
          : condition
        ).expr
      })
    }
  }

  export class Selectable<T> extends Filterable<T> {
    protected declare query: Query.Select

    leftJoin<C>(that: Collection<C>, on: Expr<boolean>): Selectable<T> {
      return new Selectable<T>({
        ...this.query,
        from: Target.Join(
          this.query.from,
          Target.Collection(that.data),
          'left',
          on.expr
        )
      })
    }

    innerJoin<C>(that: Collection<C>, on: Expr<boolean>): Selectable<T> {
      return new Selectable<T>({
        ...this.query,
        from: Target.Join(
          this.query.from,
          Target.Collection(that.data),
          'inner',
          on.expr
        )
      })
    }

    select<X extends Selection>(selection: X): Selectable<Selection.Infer<X>> {
      return new Selectable({
        ...this.query,
        selection: ExprData.create(selection)
      })
    }

    orderBy(...orderBy: Array<OrderBy>): Selectable<T> {
      return new Selectable({
        ...this.query,
        orderBy
      })
    }

    groupBy(...groupBy: Array<Expr<any>>): Selectable<T> {
      return new Selectable({
        ...this.query,
        groupBy: groupBy.map(ExprData.create)
      })
    }
  }

  export class Delete<T> extends Filterable<{rowsAffected: number}> {
    protected declare query: Query.Delete
  }

  export class Update<T> extends Filterable<{rowsAffected: number}> {
    protected declare query: Query.Update

    set(set: UpdateSet<T>): Update<T> {
      return new Update({...this.query, set})
    }
  }

  export class InsertValues extends Cursor<{rowsAffected: number}> {}

  export class Insert<T> {
    constructor(protected into: CollectionData) {}

    values(...data: Array<T>): InsertValues {
      return new InsertValues(Query.Insert({into: this.into, data}))
    }
  }

  export class SelectMultiple<T> extends Selectable<Array<T>> {}

  export class SelectSingle<T> extends Selectable<T | null> {}
}
