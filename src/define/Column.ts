import {Callable} from '../util/Callable.js'
import {EV, Expr, ExprData} from './Expr.js'
import {Fields} from './Fields.js'

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
  onUpdate?: Action
  onDelete?: Action
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
  <X = T>(): ValueColumn<X>
}

export class ValueColumn<T> extends Callable implements Column<T> {
  declare [Column.Type]: T;
  [Column.Data]: PartialColumnData

  constructor(data: PartialColumnData) {
    super(() => this)
    this[Column.Data] = data
  }

  get nullable(): NullableValueColumn<T> {
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

  references<X extends T>(column: Expr<X> | (() => Expr<X>)): ForeignKey<X> {
    return new ForeignKey({
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

export interface NullableValueColumn<T> extends Expr<T | null> {
  <X extends T = T>(): ValueColumn<X | null>
}

export declare class NullableValueColumn<T> extends ValueColumn<T | null> {}

function createDefaultValue<T>(
  value: DefaultValue<T>
): ExprData | (() => ExprData) {
  return typeof value === 'function' && !Expr.isExpr(value)
    ? () => ExprData.create((value as Function)())
    : ExprData.create(value)
}

export enum Action {
  NoAction = 'no action',
  Restrict = 'restrict',
  SetNull = 'set null',
  SetDefault = 'set default',
  Cascade = 'cascade'
}

export class ForeignKey<T> extends ValueColumn<T> {
  onUpdate(value: `${Action}`) {
    return new ForeignKey({
      ...this[Column.Data],
      onUpdate: value as Action
    })
  }

  onDelete(value: `${Action}`) {
    return new ForeignKey({
      ...this[Column.Data],
      onDelete: value as Action
    })
  }
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
  <X extends T = T>(): Column<T extends null ? X | null : X> &
    Fields<T extends null ? X | null : X>
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
    return new ValueColumn<unknown>({
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
  get string(): NullableValueColumn<string>
  get integer(): NullableValueColumn<number>
  get number(): NullableValueColumn<number>
  get boolean(): NullableValueColumn<boolean>
  get json(): NullableValueColumn<unknown>
  get object(): ObjectColumn<{} | null>
  get array(): NullableValueColumn<Array<any>>
}

export const column = new UnTyped()
