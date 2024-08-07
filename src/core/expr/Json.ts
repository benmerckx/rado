import type {HasSql} from '../Internal.ts'
import {sql} from '../Sql.ts'
import {callFunction} from './Functions.ts'
import type {Input} from './Input.ts'

export interface JsonArrayHasSql<Value> extends HasSql<Array<Value>> {
  [index: number]: JsonExpr<Value>
}

export type JsonRecordHasSql<Row> = HasSql<Row> & {
  [K in keyof Row]: JsonExpr<Row[K]>
}

type NullableEach<T> = {[P in keyof T]: T[P] | null}

export type JsonExpr<Value> = [NonNullable<Value>] extends [Array<infer V>]
  ? JsonArrayHasSql<null extends Value ? V | null : V>
  : [NonNullable<Value>] extends [object]
    ? JsonRecordHasSql<null extends Value ? NullableEach<Value> : Value>
    : HasSql<Value>

const INDEX_PROPERTY = /^\d+$/

export function jsonExpr<Value>(e: HasSql<Value>): JsonExpr<Value> {
  return new Proxy(<any>e, {
    get(target, prop) {
      if (typeof prop !== 'string') return Reflect.get(target, prop)
      const isNumber = INDEX_PROPERTY.test(prop)
      return jsonExpr(sql`${target}`.jsonPath([isNumber ? Number(prop) : prop]))
    }
  })
}

export function jsonAggregateArray(...args: Array<Input<unknown>>) {
  return callFunction(
    sql.universal({
      sqlite: sql`json_group_array`,
      postgres: sql`json_agg`,
      mysql: sql`json_arrayagg`
    }),
    args
  )
}

export function jsonArray(...args: Array<Input<unknown>>) {
  return callFunction(
    sql.universal({
      postgres: sql`json_build_array`,
      default: sql`json_array`
    }),
    args
  )
}
