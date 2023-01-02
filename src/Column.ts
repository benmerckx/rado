export const enum ColumnType {
  String = 'String',
  Integer = 'Integer',
  Number = 'Number',
  Boolean = 'Boolean',
  Object = 'Object',
  Array = 'Array'
}

export interface ColumnOptions<T> {
  name?: string
  notNull?: boolean
  autoIncrement?: boolean
  primaryKey?: boolean
  unique?: boolean
  defaultValue?: T
  generated?: boolean
}

export interface ColumnData<T = any> extends ColumnOptions<T> {
  type: ColumnType
}

export class Column<T = any> {
  constructor(public name: string, public data: ColumnData<T>) {}

  get notNull() {
    return this.data.notNull
  }

  get type() {
    return this.data.type
  }
}

function typeFactory(defaultOptions: ColumnOptions<any> = {}) {
  return {
    string<T extends string = string>(
      options: ColumnOptions<T> = {}
    ): ColumnData<T> {
      return {type: ColumnType.String, ...options}
    },
    integer<T extends number = number>(
      options: ColumnOptions<T> = {}
    ): ColumnData<T> {
      return {type: ColumnType.Integer, ...options}
    },
    number<T extends number = number>(
      options: ColumnOptions<T> = {}
    ): ColumnData<T> {
      return {type: ColumnType.Number, ...options}
    },
    boolean<T extends boolean = boolean>(
      options: ColumnOptions<T> = {}
    ): ColumnData<T> {
      return {type: ColumnType.Boolean, ...options}
    },
    object<T extends object = object>(
      options: ColumnOptions<T> = {}
    ): ColumnData<T> {
      return {type: ColumnType.Object, ...options}
    },
    array<T = any>(
      options: ColumnOptions<Array<T>> = {}
    ): ColumnData<Array<T>> {
      return {type: ColumnType.Array, ...options}
    }
  }
}

export const column = {
  ...typeFactory(),
  generated: typeFactory({generated: true})
}
