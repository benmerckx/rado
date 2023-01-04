export const enum ColumnType {
  String = 'String',
  Integer = 'Integer',
  Number = 'Number',
  Boolean = 'Boolean',
  Object = 'Object',
  Array = 'Array'
}

export interface ColumnData<T = any> {
  type: ColumnType
  name?: string
  nullable?: boolean
  autoIncrement?: boolean
  primaryKey?: boolean
  unique?: boolean
  defaultValue?: T
  generated?: boolean
}

export class Column<T = any> {
  constructor(public data: ColumnData<T>) {}

  name(name: string): Column<T> {
    return new Column({...this.data, name})
  }

  nullable(): Column<T | null> {
    return new Column({...this.data, nullable: true})
  }

  autoIncrement(): Column<T> {
    return new Column({...this.data, autoIncrement: true})
  }

  primaryKey(): Column<T> {
    return new Column({...this.data, primaryKey: true})
  }

  unique(): Column<T> {
    return new Column({...this.data, unique: true})
  }

  defaultValue(value: T): Column<T> {
    return new Column({...this.data, defaultValue: value})
  }
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
    return new Column({type: ColumnType.Object})
  },
  array<T = any>(): Column<Array<T>> {
    return new Column({type: ColumnType.Array})
  }
}
