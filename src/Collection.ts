import {Column, ColumnData} from './Column'
import {Cursor} from './Cursor'
import {Expr, ExprData} from './Expr'
import {Fields} from './Fields'
import {Query} from './Query'
import {Target} from './Target'

export interface CollectionData {
  name: string
  alias?: string
  columns: Record<string, Column>
}

export class Collection<T> extends Cursor.SelectMultiple<T> {
  private _data: CollectionData

  constructor(data: CollectionData) {
    super(Query.Select({from: Target.Collection(data)}))
    this._data = data
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

  data() {
    return this._data
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
}

export interface CollectionOptions<T> {
  name: string
  alias?: string
  columns: {[K in keyof T]: ColumnData<T[K]>}
}

export function collection<T extends {}>(
  options: CollectionOptions<T>
): Collection<T> & Fields<T> {
  return new Collection({
    ...options,
    columns: Object.fromEntries(
      Object.entries(options.columns).map(([key, value]) => {
        const data = value as ColumnData
        return [key, new Column(data.name || key, data as ColumnData)]
      })
    )
  }) as Collection<T> & Fields<T>
}

export namespace collection {
  export type infer<T> = T extends Collection<infer U> ? U : never
}
