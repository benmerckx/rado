import {EV, Expr, ExprData} from './Expr'
import {Fields} from './Fields'

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

  autoIncrement(): OptionalColumn<T> {
    return new OptionalColumn({...this.data, autoIncrement: true})
  }

  primaryKey<K = string>(create?: () => EV<T>): PrimaryColumn<T, K> {
    return new PrimaryColumn<T, K>({
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

  unique() {
    return new Column({...this.data, unique: true}) as this
  }

  defaultValue(create: () => EV<T>): OptionalColumn<T>
  defaultValue(value: EV<T>): OptionalColumn<T>
  defaultValue(value: any): OptionalColumn<T> {
    return new OptionalColumn({
      ...this.data,
      defaultValue:
        typeof value === 'function'
          ? () => ExprData.create(value())
          : ExprData.create(value)
    })
  }
}

export namespace Column {
  export declare const isOptional: unique symbol
  export declare const isPrimary: unique symbol
}

export class OptionalColumn<T> extends Column<T> {
  [Column.isOptional]!: true
}

export class PrimaryColumn<T, K> extends Column<PrimaryKey<T, K>> {
  [Column.isPrimary]!: K
}

export type PrimaryKey<T, K> = string extends K
  ? T
  : T & {[Column.isPrimary]: K}

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
  object<T extends object = object>() {
    return new Column({type: ColumnType.Json}) as Column<T> & Fields<T>
  },
  array<T = any>(): Column<Array<T>> {
    return new Column({type: ColumnType.Json})
  }
}
