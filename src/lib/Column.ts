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
  defaultValue?: ExprData
  autoIncrement?: boolean
  primaryKey?: boolean
  unique?: boolean
  references?: ExprData
  enumerable?: boolean
}

export interface ColumnData extends PartialColumnData {
  type: ColumnType
  name: string
}

export class Column<T> extends Expr<T> {
  constructor(public data: PartialColumnData) {
    super(undefined!)
  }

  name(name: string): Column<T> {
    return new Column({...this.data, name})
  }

  nullable(): Column<T | null> {
    return new Column({...this.data, nullable: true})
  }

  autoIncrement(): Column<Column.IsOptional<T>> {
    return new Column({...this.data, autoIncrement: true})
  }

  primaryKey<K>(): Column<Column.IsPrimary<T, K>> {
    return new Column({...this.data, primaryKey: true})
  }

  references<X extends T>(column: Expr<X>): Column<X> {
    return new Column({...this.data, references: ExprData.create(column)})
  }

  unique(): Column<T> {
    return new Column({...this.data, unique: true})
  }

  defaultValue(value: EV<T>): Column<Column.IsOptional<T>> {
    return new Column({...this.data, defaultValue: ExprData.create(value)})
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
  object<T extends object = object>(): Column<T> {
    return new Column({type: ColumnType.Json})
  },
  array<T = any>(): Column<Array<T>> {
    return new Column({type: ColumnType.Json})
  }
}
