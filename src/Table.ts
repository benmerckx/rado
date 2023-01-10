import {Column} from './Column'
import {Cursor} from './Cursor'
import {Expr, ExprData} from './Expr'
import {Fields} from './Fields'
import {Query} from './Query'
import {Index, Schema} from './Schema'
import {Target} from './Target'
import {Update} from './Update'

export class Table<T> extends Cursor.SelectMultiple<T> {
  /** @internal */
  protected declare __tableType: T

  constructor(schema: Schema) {
    super(
      Query.Select({
        from: Target.Table(schema),
        selection: ExprData.Row(Target.Table(schema))
      })
    )
    Object.defineProperty(this, 'schema', {
      enumerable: false,
      value: () => schema
    })
    if (schema.columns)
      for (const column of Object.keys(schema.columns)) {
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

  insertOne(record: Table.Insert<T>) {
    return new Cursor.Batch<T>([
      Query.Insert({
        into: this.schema(),
        data: [record],
        selection: ExprData.Row(Target.Table(this.schema())),
        singleResult: true
      })
    ])
  }

  insertAll(data: Array<Table.Insert<T>>) {
    return new Cursor.Insert<T>(this.schema()).values(...data)
  }

  set(data: Update<T>) {
    return new Cursor.Update<T>(
      Query.Update({
        table: this.schema()
      })
    ).set(data)
  }

  createTable() {
    return new Cursor.Create(this.schema())
  }

  as(alias: string): Table<T> & Fields<T> {
    return new Table({...this.schema(), alias}) as Table<T> & Fields<T>
  }

  get(name: string): Expr<any> {
    return new Expr(ExprData.Field(this.toExpr().expr, name as string))
  }

  toExpr() {
    return new Expr<T>(ExprData.Row(Target.Table(this.schema())))
  }

  schema(): Schema {
    throw new Error('Not implemented')
  }
}

export namespace Table {
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

export interface TableOptions<T> {
  name: string
  alias?: string
  columns: {[K in keyof T]: Column<T[K]>}
  indexes?: (this: Fields<T>) => Record<
    string,
    {
      on: Array<Expr<any>>
      where?: Expr<boolean>
    }
  >
}

export function table<T extends {}>(
  options: TableOptions<T>
): Table<T> & Fields<T> {
  const schema = {
    ...options,
    columns: Object.fromEntries(
      Object.entries(options.columns).map(([key, column]) => {
        const {data} = column as Column
        return [key, {...data, name: data.name || key}]
      })
    ),
    indexes: {}
  }
  const indexes: Record<string, Index> = Object.fromEntries(
    Object.entries(
      options.indexes
        ? options.indexes.call(
            new Expr(ExprData.Row(Target.Table(schema))) as Fields<T>
          )
        : {}
    ).map(([key, index]) => {
      return [
        key,
        {name: key, on: index.on.map(ExprData.create), where: index.where?.expr}
      ]
    })
  )
  return new Table({
    ...schema,
    indexes
  }) as Table<T> & Fields<T>
}

export namespace table {
  export type infer<T> = T extends Table<infer U> ? U : never
}
