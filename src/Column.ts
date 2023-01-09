export const enum ColumnType {
  String = 'String',
  Integer = 'Integer',
  Number = 'Number',
  Boolean = 'Boolean',
  Json = 'Json'
}

export interface ColumnData {
  type: ColumnType
  name: string
  nullable?: boolean
  defaultValue?: any
  autoIncrement?: boolean
  primaryKey?: boolean
  unique?: boolean
}

export class Column<T = any> {
  constructor(public data: Partial<ColumnData>) {}

  name(name: string): Column<T> {
    return new Column({...this.data, name})
  }

  nullable(): Column<T | null> {
    return new Column({...this.data, nullable: true})
  }

  autoIncrement(): Column<T & Column.Optional> {
    return new Column({...this.data, autoIncrement: true})
  }

  primaryKey(): Column<T & Column.Optional> {
    return new Column({...this.data, primaryKey: true})
  }

  unique(): Column<T> {
    return new Column({...this.data, unique: true})
  }

  defaultValue(value: T): Column<T & Column.Optional> {
    return new Column({...this.data, defaultValue: value})
  }
}

export namespace Column {
  declare const isOptional: unique symbol
  export type Optional = {[isOptional]: true}
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
