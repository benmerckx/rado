import {Column, column} from './Column'
import {Cursor} from './Cursor'
import {ExprData} from './Expr'
import {Query} from './Query'
import {Schema} from './Schema'
import {Target} from './Target'

const name = Symbol('name')
const indexes = Symbol('indexes')

type Definition<T> = {
  [K in keyof T as K extends string ? K : never]: Column<any> | (() => any)
}

interface Define<T> {
  new (): T
}

type DefinitionOf<Row> = {
  [K in keyof Row]: Column<Row[K]>
}

type Row<Def> = {
  [K in keyof Def as Def[K] extends Column<any>
    ? K
    : never]: Def[K] extends Column<infer T> ? T : never
}

class TableCursor<Def> extends Cursor.SelectMultiple<Row<Def>> {
  constructor(schema: Schema) {
    const from = Target.Table(schema)
    super(Query.Select({from, selection: ExprData.Row(from)}))
    return new Proxy(this, {
      get(target: any, key: string | symbol) {
        if (key === table.schema) return schema
        return key in target ? target[key] : schema.columns[key as string]
      }
    })
  }

  get [table.schema](): Schema {
    throw 'assert'
  }

  as(alias: string): this {
    return new TableCursor({...this[table.schema], alias}) as this
  }
}

type table<T> = Row<T>

interface Meta<T> {
  name: string
  indexes(this: T): Record<string, any>
}

const {entries, fromEntries, getOwnPropertyDescriptors} = Object

function table<T extends Definition<T>>(define: Define<T>, extra: Meta<T>) {
  const definition = new define()
  const columns = definition as Record<string, Column<any>>
  const schema = {
    name: extra.name,
    columns: fromEntries(
      entries(getOwnPropertyDescriptors(columns)).map(([name, descriptor]) => {
        const column = columns[name]
        if (!(column instanceof Column))
          throw new Error(`Property ${name} is not a column`)
        const {data} = column
        return [
          name,
          {...data, name: data.name || name, enumerable: descriptor.enumerable}
        ]
      })
    ),
    indexes: extra.indexes.call(definition)
  }
  return new TableCursor(schema) as T & TableCursor<T>
}

namespace table {
  export const schema = Symbol('schema')
}

type Table<Row> = DefinitionOf<Row> & TableCursor<DefinitionOf<Row>>

class UserTable {
  id = column.string().primaryKey<'User'>()
  name = column.string()
  thing = Patient.id

  patients() {
    return Patient.where().select({p: Patient})
  }
}

type User = table<UserTable>
const User = table(UserTable, {
  name: 'User',
  indexes() {
    return {
      id: this.id
    }
  }
})

const y = {...User, test: User.patients}

class PatientTable {
  id = column.string().primaryKey<'Patient'>()
  lastName = column.string()
  thing = column.string()

  get firstName() {
    return column.string()
  }

  users() {
    return User.id
  }
}

type Patient = table<PatientTable>
const Patient = table(PatientTable, {
  name: 'Patient',
  indexes() {
    return {
      id: this.users
    }
  }
})

const x = {...Patient}

function test<T extends {id: string}>(table: Table<T>, entry: T) {
  return table.id
}
