export const enum ColumnType {
  String,
  Number,
  Boolean,
  Object,
  Array
}

export interface ColumnOptions<T> {
  name?: string
  nullable?: boolean
  byDefault?: T
  generated?: boolean
}

export interface ColumnData<T = any> extends ColumnOptions<T> {
  type: ColumnType
}

export class Column<T = any> {
  constructor(public name: string, public options: ColumnOptions<T>) {}
}

function typeFactory(defaultOptions: ColumnOptions<any> = {}) {
  return {
    string<T = string>(options: ColumnOptions<T> = {}): ColumnData<T> {
      return {type: ColumnType.String, ...options}
    },
    number<T = number>(options: ColumnOptions<T> = {}): ColumnData<T> {
      return {type: ColumnType.Number, ...options}
    },
    boolean<T = boolean>(options: ColumnOptions<T> = {}): ColumnData<T> {
      return {type: ColumnType.Boolean, ...options}
    },
    object<T = {}>(options: ColumnOptions<T> = {}): ColumnData<T> {
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
