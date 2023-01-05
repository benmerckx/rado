import {Column, ColumnData} from './Column'
import {Cursor} from './Cursor'
import {Expr, ExprData} from './Expr'
import {Fields} from './Fields'
import {Query} from './Query'
import {Target} from './Target'
import {Update} from './Update'

export interface CollectionData {
  name: string
  alias?: string
  columns: Record<string, ColumnData>
  indexes?: Record<string, Array<Expr<any>>>
}

export class Collection<T> extends Cursor.SelectMultiple<T> {
  constructor(data: CollectionData) {
    super(
      Query.Select({
        from: Target.Collection(data),
        selection: ExprData.Row(Target.Collection(data))
      })
    )
    Object.defineProperty(this, 'data', {
      enumerable: false,
      value: () => data
    })
    for (const column of Object.keys(data.columns)) {
      Object.defineProperty(this, column, {
        enumerable: true,
        get: () => this.get(column)
      })
    }
    return new Proxy(this, {
      get(target: any, key) {
        return key in target ? target[key] : target.get(key)
      }
    })
  }

  insertOne(record: Collection.Insert<T>) {
    return new Cursor.Batch<T>([
      Query.Insert({
        into: this.data(),
        data: [record],
        selection: ExprData.Row(Target.Collection(this.data())),
        singleResult: true
      })
    ])
  }

  insertAll(data: Array<Collection.Insert<T>>) {
    return new Cursor.Insert<T>(this.data()).values(...data)
  }

  set(data: Update<T>) {
    return new Cursor.Update<T>(
      Query.Update({
        collection: this.data()
      })
    ).set(data)
  }

  createTable() {
    return new Cursor.Create(this.data())
  }

  as(alias: string): Collection<T> & Fields<T> {
    return new Collection({...this.data(), alias}) as Collection<T> & Fields<T>
  }

  get(name: string): Expr<any> {
    return new Expr(ExprData.Field(this.toExpr().expr, name as string))
  }

  toExpr() {
    return new Expr<T>(ExprData.Row(Target.Collection(this.data())))
  }

  /** @internal */
  data(): CollectionData {
    throw new Error('Not implemented')
  }
}

export namespace Collection {
  // Source: https://stackoverflow.com/a/67577722
  type Intersection<A, B> = A & B extends infer U
    ? {[P in keyof U]: U[P]}
    : never
  type OptionalKeys<T> = {
    [K in keyof T]: null extends T[K]
      ? K
      : T[K] extends Column.Optional
      ? K
      : never
  }[keyof T]
  type RequiredKeys<T> = {
    [K in keyof T]: null extends T[K]
      ? never
      : T[K] extends Column.Optional
      ? never
      : K
  }[keyof T]
  type Optionals<T> = {
    [K in keyof T]?: T[K] extends Column.Optional & infer V ? V : T[K]
  }
  export type Insert<T> = Intersection<
    Optionals<Pick<T, OptionalKeys<T>>>,
    Pick<T, RequiredKeys<T>>
  >
}

export interface CollectionOptions<T> {
  name: string
  alias?: string
  columns: {[K in keyof T]: Column<T[K]>}
}

export function collection<T extends {}>(
  options: CollectionOptions<T>
): Collection<T> & Fields<T> {
  return new Collection({
    ...options,
    columns: Object.fromEntries(
      Object.entries(options.columns).map(([key, column]) => {
        const {data} = column as Column
        return [key, {...data, name: data.name || key}]
      })
    )
  }) as Collection<T> & Fields<T>
}

export namespace collection {
  export type infer<T> = T extends Collection<infer U> ? U : never
}
