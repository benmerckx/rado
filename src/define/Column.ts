import {EV, Expr, ExprData} from './Expr'

export enum ColumnType {
  String = 'String',
  Integer = 'Integer',
  Number = 'Number',
  Boolean = 'Boolean',
  Json = 'Json'
}

interface PartialColumnData {
  type: ColumnType
  name?: string
  nullable?: boolean
  defaultValue?: ExprData | (() => ExprData)
  autoIncrement?: boolean
  primaryKey?: boolean
  unique?: boolean
  references?: () => ExprData
}

export interface ColumnData extends PartialColumnData {
  type: ColumnType
  name: string
}

export class Column<T> {
  constructor(public data: PartialColumnData) {}

  name(name: string): Column<T> {
    return new Column({...this.data, name})
  }

  nullable(): Column<T | null> {
    return new Column({...this.data, nullable: true})
  }

  autoIncrement(): Column<Column.IsOptional<T>> {
    return new Column({...this.data, autoIncrement: true})
  }

  primaryKey<K extends string>(
    create?: () => EV<T>
  ): Column<Column.IsPrimary<T, K>> {
    return new Column({
      ...this.data,
      primaryKey: true,
      defaultValue: create
        ? () => ExprData.create(create())
        : this.data.defaultValue
    })
  }

  references<X extends T>(column: Expr<X> | (() => Expr<X>)): Column<X> {
    return new Column({
      ...this.data,
      references() {
        return ExprData.create(typeof column === 'function' ? column() : column)
      }
    })
  }

  unique(): Column<T> {
    return new Column({...this.data, unique: true})
  }

  defaultValue(create: () => EV<T>): Column<Column.IsOptional<T>>
  defaultValue(value: EV<T>): Column<Column.IsOptional<T>>
  defaultValue(value: any): Column<Column.IsOptional<T>> {
    return new Column({
      ...this.data,
      defaultValue:
        typeof value === 'function'
          ? () => ExprData.create(value())
          : ExprData.create(value)
    })
  }
}

export type PrimaryKey<T, K> = string extends K
  ? T
  : T & {[Column.isPrimary]: K}

export namespace Column {
  export declare const isOptional: unique symbol
  export type IsOptional<T> = {[isOptional]: true; __t: T}
  export declare const isPrimary: unique symbol
  export type IsPrimary<T, K> = {[isPrimary]: K; __t: T}
}

export const column = {
  string<T extends string = string>(): Column<T> {
    return new Column({type: ColumnType.String})
  },
  integer<T extends number = number>(): Column<T> {
    return new Column({type: ColumnType.Integer})
  },
  number<T extends number = number>(): Column<T> {
    return new Column({type: ColumnType.Number})
  },
  boolean<T extends boolean = boolean>(): Column<T> {
    return new Column({type: ColumnType.Boolean})
  },
  json<T = any>(): Column<T> {
    return new Column({type: ColumnType.Json})
  },
  object<T extends object = object>(): Column<T> {
    return new Column({type: ColumnType.Json})
  },
  array<T = any>(): Column<Array<T>> {
    return new Column({type: ColumnType.Json})
  }
}
