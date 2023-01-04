import {Column, ColumnData} from './Column'
import {Cursor} from './Cursor'
import {Expr, ExprData} from './Expr'
import {Fields} from './Fields'
import {Query} from './Query'
import {Target} from './Target'

export interface CollectionData {
  name: string
  alias?: string
  columns: Record<string, ColumnData>
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
    return new Proxy(this, {
      get(target: any, key) {
        return key in target ? target[key] : target.get(key)
      }
    })
  }

  insertOne(data: T) {
    return new Cursor.Insert<T>(this.data()).values(data)
  }

  insertAll(data: Array<T>) {
    return new Cursor.Insert<T>(this.data()).values(...data)
  }

  set(data: Partial<T>) {
    return new Cursor.Update<T>(
      Query.Update({
        collection: this.data()
      })
    ).set(data)
  }

  create() {
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

export interface CollectionOptions<T> {
  name: string
  alias?: string
  columns: {[K in keyof T]: Column<T[K]>}
}

type FieldsOf<T> = {
  [K in keyof T]: null extends T[K] ? undefined | T[K] : T[K]
}

export function collection<T extends {}>(
  options: CollectionOptions<T>
): Collection<FieldsOf<T>> & Fields<T> {
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
