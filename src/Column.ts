import {Expr, ExprData} from './Expr'

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
  defaultValue?: any
  autoIncrement?: boolean
  primaryKey?: boolean
  unique?: boolean
  references?: ExprData
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

  autoIncrement(): Column<Column.Optional<T>> {
    return new Column({...this.data, autoIncrement: true})
  }

  primaryKey<K extends string>(): Column<Column.Primary<K, T>> {
    return new Column({...this.data, primaryKey: true})
  }

  references(column: Expr<T>): Column<T> {
    return new Column({...this.data, references: ExprData.create(column)})
  }

  unique(): Column<T> {
    return new Column({...this.data, unique: true})
  }

  defaultValue(value: T): Column<Column.Optional<T>> {
    return new Column({...this.data, defaultValue: value})
  }
}

export namespace Column {
  export declare const isOptional: unique symbol
  export type Optional<T> = {[isOptional]: true; __t: T}
  export declare const isPrimary: unique symbol
  export type Primary<Of, T> = {[isPrimary]: Of; __t: T}
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
