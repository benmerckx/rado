import {callable} from '../util/Callable'
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

export interface Column<T> {
  [Column.type]: T
  [Column.data]: PartialColumnData
}

export namespace Column {
  export const data = Symbol('columnData')
  export const type = Symbol('columnType')
  export declare const isOptional: unique symbol
  export declare const isNullable: unique symbol
  export declare const isPrimary: unique symbol
}

interface ValueColumn<T> extends Expr<T> {
  <X extends T = T>(): ValueColumn<T extends null ? X | null : X>
}

class ValueColumn<T> implements Column<T> {
  [Column.type]!: T;
  [Column.data]: PartialColumnData

  constructor(data: PartialColumnData) {
    this[Column.data] = data
    return callable(this, (defaultValue: DefaultValue<T>) => {
      return new ValueColumn({
        ...this[Column.data],
        defaultValue: createDefaultValue(defaultValue)
      })
    })
  }

  get nullable(): ValueColumn<T | null> {
    return new ValueColumn({...this[Column.data], nullable: true})
  }

  get unique(): ValueColumn<T> {
    return new ValueColumn({...this[Column.data], unique: true})
  }

  get autoIncrement(): OptionalColumn<T> {
    return new OptionalColumn({...this[Column.data], autoIncrement: true})
  }

  primaryKey<K = string>(create?: () => EV<T>): PrimaryColumn<T, K> {
    return new PrimaryColumn<T, K>({
      ...this[Column.data],
      primaryKey: true,
      defaultValue: create
        ? () => ExprData.create(create())
        : this[Column.data].defaultValue
    })
  }

  references<X extends T>(column: Expr<X> | (() => Expr<X>)): ValueColumn<X> {
    return new ValueColumn({
      ...this[Column.data],
      references() {
        return ExprData.create(Expr.isExpr(column) ? column : column())
      }
    })
  }

  defaultValue(value: DefaultValue<T>): OptionalColumn<T> {
    return new OptionalColumn({
      ...this[Column.data],
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
  [Column.isOptional]!: true
}

export class PrimaryColumn<T, K> extends ValueColumn<PrimaryKey<T, K>> {
  [Column.isPrimary]!: K
}

interface ObjectColumn<T> {
  <X extends T = T>(): Column<T extends null ? X | null : X> & Fields<X>
}

class ObjectColumn<T> implements Column<T> {
  [Column.type]!: T;
  [Column.data]: PartialColumnData

  constructor(data: PartialColumnData) {
    this[Column.data] = data
    return callable(this, () => this)
  }

  get nullable(): ObjectColumn<T | null> {
    return new ObjectColumn({...this[Column.data], nullable: true})
  }

  get unique(): ObjectColumn<T> {
    return new ObjectColumn({...this[Column.data], unique: true})
  }

  defaultValue<X extends T = T>(value: DefaultValue<X>): Column<X> & Fields<X> {
    return new OptionalObjectColumn({
      ...this[Column.data],
      defaultValue: createDefaultValue(value)
    }) as any
  }
}

export class OptionalObjectColumn<T> extends ObjectColumn<T> {
  [Column.isOptional]!: true
}

export type PrimaryKey<T, K> = string extends K
  ? T
  : T & {[Column.isPrimary]: K}

type DefaultValue<T> = EV<T> | (() => EV<T>)

interface UnTyped {
  (name: string): UnTyped
}

class UnTyped {
  [Column.data]!: PartialColumnData

  constructor(data: PartialColumnData = {}) {
    this[Column.data] = data
    return callable(this, (name: string) => {
      return new ValueColumn({...data, name})
    })
  }

  get nullable(): NullableUnTyped {
    return new UnTyped({...this[Column.data], nullable: true})
  }

  get unique(): UnTyped {
    return new UnTyped({...this[Column.data], unique: true})
  }

  get string() {
    return new ValueColumn<string>({
      ...this[Column.data],
      type: ColumnType.String
    })
  }

  get integer() {
    return new ValueColumn<number>({
      ...this[Column.data],
      type: ColumnType.Integer
    })
  }

  get number() {
    return new ValueColumn<number>({
      ...this[Column.data],
      type: ColumnType.Number
    })
  }

  get boolean() {
    return new ValueColumn<boolean>({
      ...this[Column.data],
      type: ColumnType.Boolean
    })
  }

  get json() {
    return new ValueColumn<any>({
      ...this[Column.data],
      type: ColumnType.Json
    })
  }

  get object() {
    return new ObjectColumn<{}>({
      ...this[Column.data],
      type: ColumnType.Json
    })
  }

  get array() {
    return new ValueColumn<Array<any>>({
      ...this[Column.data],
      type: ColumnType.Json
    })
  }
}

declare class NullableUnTyped {
  [Column.data]: PartialColumnData

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
