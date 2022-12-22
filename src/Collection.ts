import {Expr, ExprData} from './Expr'
import {Fields} from './Fields'
import {Target} from './Target'

export interface CollectionData {
  name: string
  alias?: string
  columns: Record<string, ExprData>
}

export class Collection<T> {
  constructor(public data: CollectionData) {
    return new Proxy(this, {
      get(target: any, key) {
        return key in target ? target[key] : target.get(key)
      }
    })
  }

  as(alias: string): Collection<T> & Fields<T> {
    return new Collection({...this.data, alias}) as Collection<T> & Fields<T>
  }

  get(name: string): Expr<any> {
    return new Expr(ExprData.Field(this.toExpr().expr, name as string))
  }

  toExpr() {
    return new Expr<T>(ExprData.Row(Target.Collection(this.data)))
  }
}

export interface CollectionOptions<T> {
  name: string
  alias?: string
  columns: {[K in keyof T]: string}
}

export function collection<T extends {}>(
  options: CollectionOptions<T>
): Collection<T> & Fields<T> {
  return new Collection({
    ...options,
    columns: Object.fromEntries(
      Object.entries(options.columns).map(([key, value]) => [
        key,
        ExprData.create(value)
      ])
    )
  }) as Collection<T> & Fields<T>
}
