import {Callable} from '../util/Callable'
import {EV, Expr, ExprData} from './Expr'
import {Fields} from './Fields'

const DATA = Symbol('Column.Data')
const TYPE = Symbol('Column.Type')

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
  [TYPE]: T
  [DATA]: PartialColumnData
}

export namespace Column {
  export const Data: typeof DATA = DATA
  export const Type: typeof TYPE = TYPE
  export declare const IsOptional: unique symbol
  export declare const IsNullable: unique symbol
  export declare const IsPrimary: unique symbol

  export function isColumn<T>(input: any): input is Column<T> {
    return Boolean(input[DATA])
  }
}

interface ValueColumn<T> extends Expr<T> {
  <X extends T = T>(): ValueColumn<T extends null ? X | null : X>
}

class ValueColumn<T> extends Callable implements Column<T> {
  declare [TYPE]: T;
  [DATA]: PartialColumnData

  constructor(data: PartialColumnData) {
    super(() => this)
    this[DATA] = data
  }

  get nullable(): ValueColumn<T | null> {
    return new ValueColumn({...this[DATA], nullable: true})
  }

  get unique(): ValueColumn<T> {
    return new ValueColumn({...this[DATA], unique: true})
  }

  get autoIncrement(): OptionalColumn<T> {
    return new OptionalColumn({...this[DATA], autoIncrement: true})
  }

  primaryKey<K = string>(create?: () => EV<T>): PrimaryColumn<T, K> {
    return new PrimaryColumn<T, K>({
      ...this[DATA],
      primaryKey: true,
      defaultValue: create
        ? () => ExprData.create(create())
        : this[DATA].defaultValue
    })
  }

  references<X extends T>(column: Expr<X> | (() => Expr<X>)): ValueColumn<X> {
    return new ValueColumn({
      ...this[DATA],
      references() {
        return ExprData.create(Expr.isExpr(column) ? column : column())
      }
    })
  }

  default(value: DefaultValue<T>): OptionalColumn<T> {
    return new OptionalColumn({
      ...this[DATA],
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

export class PrimaryColumn<T, K> extends ValueColumn<PrimaryKey<T, K>> {
  [Column.IsPrimary]!: K
}

interface ObjectColumn<T> {
  <X extends T = T>(): Column<T extends null ? X | null : X> & Fields<X>
}

class ObjectColumn<T> extends Callable implements Column<T> {
  declare [TYPE]: T;
  [DATA]: PartialColumnData

  constructor(data: PartialColumnData) {
    super(() => this)
    this[DATA] = data
  }

  get nullable(): ObjectColumn<T | null> {
    return new ObjectColumn({...this[DATA], nullable: true})
  }

  get unique(): ObjectColumn<T> {
    return new ObjectColumn({...this[DATA], unique: true})
  }

  defaultValue<X extends T = T>(value: DefaultValue<X>): Column<X> & Fields<X> {
    return new OptionalObjectColumn({
      ...this[DATA],
      defaultValue: createDefaultValue(value)
    }) as any
  }
}

export class OptionalObjectColumn<T> extends ObjectColumn<T> {
  [Column.IsOptional]!: true
}

export type PrimaryKey<T, K> = string extends K
  ? T
  : T & {[Column.IsPrimary]: K}

type DefaultValue<T> = EV<T> | (() => EV<T>)

interface UnTyped {
  (name: string): UnTyped
}

class UnTyped extends Callable {
  [DATA]: PartialColumnData

  constructor(data: PartialColumnData = {}) {
    super((name: string) => {
      return new ValueColumn({...data, name})
    })
    this[DATA] = data
  }

  get nullable(): NullableUnTyped {
    return new UnTyped({...this[DATA], nullable: true})
  }

  get unique(): UnTyped {
    return new UnTyped({...this[DATA], unique: true})
  }

  get string() {
    return new ValueColumn<string>({
      ...this[DATA],
      type: ColumnType.String
    })
  }

  get integer() {
    return new ValueColumn<number>({
      ...this[DATA],
      type: ColumnType.Integer
    })
  }

  get number() {
    return new ValueColumn<number>({
      ...this[DATA],
      type: ColumnType.Number
    })
  }

  get boolean() {
    return new ValueColumn<boolean>({
      ...this[DATA],
      type: ColumnType.Boolean
    })
  }

  get json() {
    return new ValueColumn<any>({
      ...this[DATA],
      type: ColumnType.Json
    })
  }

  get object() {
    return new ObjectColumn<{}>({
      ...this[DATA],
      type: ColumnType.Json
    })
  }

  get array() {
    return new ValueColumn<Array<any>>({
      ...this[DATA],
      type: ColumnType.Json
    })
  }
}

declare class NullableUnTyped {
  [DATA]: PartialColumnData

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
