import {Column, column} from './Column'
import {Cursor} from './Cursor'
import {ExprData} from './Expr'
import {Index, index} from './Index'
import {Query} from './Query'
import {Schema} from './Schema'
import {Target} from './Target'

interface Meta {
  indexes?: Record<string, Index>
}

type Definition<T> = {
  [K in keyof T as K extends string ? K : never]: Column<any> | (() => any)
}

interface Define<T> {
  new (): T
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

  get<K extends string>(field: K): K extends keyof Def ? Def[K] : Column<any> {
    return undefined!
  }
}

type table<T> = T extends Table<infer D> ? Row<D> : never

const {entries, fromEntries, getOwnPropertyDescriptors} = Object

type DefineTable = <
  T extends Definition<T> & {
    [table.meta]?: Meta
  }
>(
  define: T | Define<T>
) => Table<T>

function table(templateStrings: TemplateStringsArray): DefineTable
function table(name: string): DefineTable
function table(input: string | TemplateStringsArray) {
  return function define<T extends Definition<T>>(define: Define<T> | T) {
    const name = typeof input === 'string' ? input : input[0]
    const definition = 'prototype' in define ? new define() : define
    const columns = definition as Record<string, Column<any>>
    const schema: Schema = {
      name: name,
      columns: fromEntries(
        entries(getOwnPropertyDescriptors(columns)).map(
          ([name, descriptor]) => {
            const column = columns[name]
            if (!(column instanceof Column))
              throw new Error(`Property ${name} is not a column`)
            const {data} = column
            return [
              name,
              {
                ...data,
                name: data.name || name,
                enumerable: descriptor.enumerable
              }
            ]
          }
        )
      ),
      indexes: {} // extra.indexes?.call(definition) || {}
    }
    return new TableCursor(schema) as Table<T>
  }
}

type Table<T> = T & TableCursor<T>

namespace table {
  export const name = Symbol('name')
  export const indexes = Symbol('indexes')
  export const schema = Symbol('schema')
  export const meta = Symbol('meta')
}

const User = table('User')(
  class User {
    id = column.string().primaryKey<User>()
    name = column.string()
    leftJoin = column.string()

    get thing() {
      return Patient.id
    }

    patients() {
      return Patient.select({p: Patient})
    }

    [table.meta] = {
      indexes: {
        id: index(this.id)
      }
    }
  }
)
type User = table<typeof User>

const y = {...User, thing: User.thing}
const zeirj = User[table.meta]

const z = User.get('leftJoin')

interface Patient extends table<typeof Patient> {}
const Patient = table('Patient')({
  id: column.string().primaryKey<Patient>(),
  lastName: column.string(),
  thing: column.string(),

  firstName() {
    return column.string()
  },

  users() {
    return User.id
  }
})

const x = {...Patient}

function test<T extends {id: string}>(table: Table<T>, entry: T) {
  return table.id
}

const seofj = User.where(true)
const xyz = Patient.where(true)
