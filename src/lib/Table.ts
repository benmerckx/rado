import {Column, PrimaryKey} from './Column'
import {Cursor} from './Cursor'
import {Expr, ExprData} from './Expr'
import {Fields} from './Fields'
import {Index, IndexData} from './Index'
import {Query} from './Query'
import {Schema} from './Schema'
import {Selection} from './Selection'
import {Target} from './Target'
import {Update} from './Update'

export class Table<T> extends Cursor.SelectMultiple<Table.Normalize<T>> {
  [Selection.__tableType](): Table.Normalize<T> {
    throw 'assert'
  }

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
    return new Cursor.Batch<Table.Normalize<T>>([
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

  set(data: Update<Table.Normalize<T>>) {
    return new Cursor.Update<Table.Normalize<T>>(
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

  toExpr(): Expr<Table.Normalize<T>> {
    return new Expr<Table.Normalize<T>>(
      ExprData.Row(Target.Table(this.schema()))
    )
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
      : T[K] extends Column.IsPrimary<any, any>
      ? K
      : T[K] extends Column.IsOptional<any>
      ? K
      : never
  }[keyof T]
  type RequiredKeys<T> = {
    [K in keyof T]: null extends T[K]
      ? never
      : T[K] extends Column.IsPrimary<any, any>
      ? never
      : T[K] extends Column.IsOptional<any>
      ? never
      : K
  }[keyof T]
  type Optionals<T> = {
    [K in keyof T]?: T[K] extends Column.IsOptional<infer V>
      ? V
      : T[K] extends Column.IsPrimary<infer V, infer K>
      ? PrimaryKey<V, K>
      : T[K]
  }
  export type Insert<T> = Intersection<
    Optionals<Pick<T, OptionalKeys<T>>>,
    Pick<T, RequiredKeys<T>>
  >
  export type Normalize<T> = {
    [K in keyof T]: T[K] extends Column.IsOptional<infer V>
      ? V
      : T[K] extends Column.IsPrimary<infer V, infer K>
      ? PrimaryKey<V, K>
      : T[K]
  }
  export type Infer<T> = T extends Table<infer U> ? Normalize<U> : never
}

export interface TableOptions<T> {
  name: string
  alias?: string
  columns: {[K in keyof T]: Column<T[K]>}
  indexes?: (this: Fields<T>) => Record<string, Index>
}

export function table<T extends {}>(
  options: TableOptions<T>
): Table<T> & Fields<T> {
  const schema = {
    ...options,
    columns: Object.fromEntries(
      Object.entries(options.columns).map(([key, column]) => {
        const {data} = column as Column<any>
        return [key, {...data, name: data.name || key}]
      })
    ),
    indexes: {}
  }
  const indexes: Record<string, IndexData> = Object.fromEntries(
    Object.entries(
      options.indexes
        ? options.indexes.call(
            new Expr(ExprData.Row(Target.Table(schema))) as Fields<T>
          )
        : {}
    ).map(([key, index]) => {
      const indexName = `${schema.name}.${key}`
      return [
        indexName,
        {
          name: indexName,
          ...index.data
        }
      ]
    })
  )
  return new Table({
    ...schema,
    indexes
  }) as Table<T> & Fields<T>
}

export namespace table {
  export type infer<T> = Table.Infer<T>
}
