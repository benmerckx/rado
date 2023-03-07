import {Callable} from '../util/Callable'
import {EV, Expr, ExprData} from './Expr'
import {Fields} from './Fields'

export enum ColumnType {
  String = 'String',
  Integer = 'Integer',
  Number = 'Number',
  Boolean = 'Boolean',
  Json = 'Json'
}

export interface PartialColumnData {
  type?: ColumnType
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

export declare class Column<T> {
  get [Column.Type](): T
  get [Column.Data](): PartialColumnData
}

export namespace Column {
  export const Data = Symbol('Column.Data')
  export const Type = Symbol('Column.Type')
  export declare const IsOptional: unique symbol
  export declare const IsNullable: unique symbol
  export declare const IsPrimary: unique symbol

  export function isColumn<T>(input: any): input is Column<T> {
    return Boolean(input[Column.Data])
  }
}

export interface ValueColumn<T> extends Expr<T> {
  <X extends T = T>(): ValueColumn<T extends null ? X | null : X>
}

export class ValueColumn<T> extends Callable implements Column<T> {
  declare [Column.Type]: T;
  [Column.Data]: PartialColumnData

  constructor(data: PartialColumnData) {
    super(() => this)
    this[Column.Data] = data
  }

  get nullable(): ValueColumn<T | null> {
    return new ValueColumn({...this[Column.Data], nullable: true})
  }

  get unique(): ValueColumn<T> {
    return new ValueColumn({...this[Column.Data], unique: true})
  }

  get autoIncrement(): OptionalColumn<T> {
    return new OptionalColumn({...this[Column.Data], autoIncrement: true})
  }

  primaryKey<K = string>(create?: () => EV<T>): PrimaryColumn<T, K> {
    return new PrimaryColumn<T, K>({
      ...this[Column.Data],
      primaryKey: true,
      defaultValue: create
        ? () => ExprData.create(create())
        : this[Column.Data].defaultValue
    })
  }

  references<X extends T>(column: Expr<X> | (() => Expr<X>)): ValueColumn<X> {
    return new ValueColumn({
      ...this[Column.Data],
      references() {
        return ExprData.create(Expr.isExpr<X>(column) ? column : column())
      }
    })
  }

  default(value: DefaultValue<T>): OptionalColumn<T> {
    return new OptionalColumn({
      ...this[Column.Data],
      defaultValue: createDefaultValue(value)
    })
  }
}

function createDefaultValue<T>(
  value: DefaultValue<T>
): ExprData | (() => ExprData) {
  return typeof value === 'function' && !Expr.isExpr(value)
    ? () => ExprData.create((value as Function)())
    : ExprData.create(value)
}

export class OptionalColumn<T> extends ValueColumn<T> {
  [Column.IsOptional]!: true
}

export class PrimaryColumn<T, K> extends ValueColumn<
  string extends K ? T : PrimaryKey<T, K>
> {
  [Column.IsPrimary]!: K
}

export interface ObjectColumn<T> {
  <X extends T = T>(): Column<T extends null ? X | null : X> & Fields<X>
}

export class ObjectColumn<T> extends Callable implements Column<T> {
  declare [Column.Type]: T;
  [Column.Data]: PartialColumnData

  constructor(data: PartialColumnData) {
    super(() => this)
    this[Column.Data] = data
  }

  get nullable(): ObjectColumn<T | null> {
    return new ObjectColumn({...this[Column.Data], nullable: true})
  }

  get unique(): ObjectColumn<T> {
    return new ObjectColumn({...this[Column.Data], unique: true})
  }

  defaultValue<X extends T = T>(value: DefaultValue<X>): Column<X> & Fields<X> {
    return new OptionalObjectColumn({
      ...this[Column.Data],
      defaultValue: createDefaultValue(value)
    }) as any
  }
}

export class OptionalObjectColumn<T> extends ObjectColumn<T> {
  [Column.IsOptional]!: true
}

export type PrimaryKey<T, K> = T & {[Column.IsPrimary]: K}

type DefaultValue<T> = EV<T> | (() => EV<T>)

export interface UnTyped {
  (name: string): UnTyped
}

export class UnTyped extends Callable {
  [Column.Data]: PartialColumnData

  constructor(data: PartialColumnData = {}) {
    super((name: string) => {
      return new ValueColumn({...data, name})
    })
    this[Column.Data] = data
  }

  get nullable(): NullableUnTyped {
    return new UnTyped({
      ...this[Column.Data],
      nullable: true
    }) as NullableUnTyped
  }

  get unique(): UnTyped {
    return new UnTyped({...this[Column.Data], unique: true})
  }

  get string() {
    return new ValueColumn<string>({
      ...this[Column.Data],
      type: ColumnType.String
    })
  }

  get integer() {
    return new ValueColumn<number>({
      ...this[Column.Data],
      type: ColumnType.Integer
    })
  }

  get number() {
    return new ValueColumn<number>({
      ...this[Column.Data],
      type: ColumnType.Number
    })
  }

  get boolean() {
    return new ValueColumn<boolean>({
      ...this[Column.Data],
      type: ColumnType.Boolean
    })
  }

  get json() {
    return new ValueColumn<any>({
      ...this[Column.Data],
      type: ColumnType.Json
    })
  }

  get object() {
    return new ObjectColumn<{}>({
      ...this[Column.Data],
      type: ColumnType.Json
    })
  }

  get array() {
    return new ValueColumn<Array<any>>({
      ...this[Column.Data],
      type: ColumnType.Json
    })
  }
}

export declare class NullableUnTyped {
  [Column.Data]: PartialColumnData

  get unique(): UnTyped
  get string(): ValueColumn<string | null>
  get integer(): ValueColumn<number | null>
  get number(): ValueColumn<number | null>
  get boolean(): ValueColumn<boolean | null>
  get json(): ValueColumn<any | null>
  get object(): ObjectColumn<{} | null>
  get array(): ValueColumn<Array<any> | null>
}

export const column = new UnTyped()
