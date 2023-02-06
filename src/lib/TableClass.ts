import {Column, column} from './Column'
import {Cursor} from './Cursor'
import {EV, Expr, ExprData} from './Expr'
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

type table<T> = T extends Table<infer D> ? Row<D> : never

const {keys, entries, fromEntries, getOwnPropertyDescriptors} = Object

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
    function cursor(...conditions: Array<EV<boolean>>) {
      const from = Target.Table(schema)
      return new Cursor.SelectMultiple(
        Query.Select({
          from,
          selection: ExprData.Row(from),
          where: Expr.and(...conditions).expr
        })
      )
    }
    const cols = keys(schema.columns)
    const hasKeywords = cols.some(name => name in Function)
    if (hasKeywords) {
      return new Proxy(cursor, {
        get(_, key: string | symbol) {
          return schema.columns[key as string]
        }
      })
    }
    return Object.assign(
      cursor,
      fromEntries(cols.map(name => [name, schema.columns[name]]))
    )
  }
}

type Table<T> = T & {
  (...conditions: Array<EV<boolean>>): Cursor.SelectMultiple<Row<T>>
  // Clear the Function prototype, not sure if there's a better way
  // as mapped types (Omit) will remove the callable signature
  // Seems open: Microsoft/TypeScript#27575
  name: unknown
  length: unknown
  call: unknown
  apply: unknown
  bind: unknown
  prototype: unknown
}

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
    length = column.string()
    apply = column.string()
    leftJoin = column.string()

    get thing() {
      return Patient.id
    }

    patients() {
      return Patient().select({p: Patient})
    }

    [table.meta] = {
      indexes: {
        id: index(this.id)
      }
    }
  }
)
type User = table<typeof User>

const y = User().select({...User, thing: User.thing})
const zeirj = User[table.meta]

const z = User.leftJoin

const Patient = table('Patient')({
  id: column.string().primaryKey<'Patient'>(),
  lastName: column.string(),
  thing: column.string(),

  firstName() {
    return column.string()
  },

  users() {
    return User.id
  }
})
type Patient = table<typeof Patient>

const x = {...Patient}

Patient().where(true)

function test<T extends {id: string}>(table: Table<T>, entry: T) {
  return table.id
}

const seofj = User(User.length.is('sdf'))
const xyz = Patient().where(true)
