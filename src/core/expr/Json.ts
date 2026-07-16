import {type HasSql, getSql} from '../Internal.ts'
import {type Sql, sql} from '../Sql.ts'
import {callFunction} from './Functions.ts'
import type {Input} from './Input.ts'

export interface JsonArrayHasSql<Value> extends HasSql<Array<Value>> {
  [index: number]: JsonExpr<Value>
}

export type JsonRecordHasSql<Row> = HasSql<Row> & {
  [K in keyof Row]: JsonExpr<Row[K]>
}

type NullableEach<T> = {[P in keyof T]: T[P] | null}

export type JsonExpr<Value> = unknown extends Value
  ? HasSql<Value>
  : [NonNullable<Value>] extends [Array<infer V>]
    ? JsonArrayHasSql<null extends Value ? V | null : V>
    : [NonNullable<Value>] extends [object]
      ? JsonRecordHasSql<null extends Value ? NullableEach<Value> : Value>
      : HasSql<Value>

const INDEX_PROPERTY = /^\d+$/

export interface JsonPath {
  target: Sql
  segments: Array<number | string>
  asSql: boolean
}

export function jsonExpr<Value>(e: HasSql<Value>): JsonExpr<Value> {
  return new Proxy(<any>e, {
    get(target, prop) {
      if (typeof prop !== 'string') return Reflect.get(target, prop)
      const isNumber = INDEX_PROPERTY.test(prop)
      return jsonExpr(
        sql
          .jsonPath({
            target: getSql(target),
            segments: [isNumber ? Number(prop) : prop],
            asSql: true
          })
          .mapWith({
            mapFromDriverValue(value, specs) {
              return specs.parsesJson ? value : JSON.parse(value as string)
            }
          })
      )
    }
  })
}

export function jsonAggregateArray(...args: Array<Input<unknown>>) {
  return callFunction(
    sql.universal({
      // Once sqlite 3.45+ is more commonplace we can use jsonb_group_array
      sqlite: sql`json_group_array`,
      postgres: sql`jsonb_agg`,
      mysql: sql`json_arrayagg`
    }),
    args
  )
}

/**
 * Preserve the input order of a JSON aggregate on MySQL.
 *
 * MySQL ignores ORDER BY in a derived table when the outer query aggregates
 * it. LIMIT prevents the derived table from being merged, and the maximum
 * unsigned limit retains every row without computing an extra window column.
 */
export function preserveJsonAggregateOrder(rows: Sql): Sql {
  return sql.universal({
    mysql: sql`${rows} limit 18446744073709551615`,
    default: rows
  })
}

export function jsonArray(...args: Array<Input<unknown>>) {
  return callFunction(
    sql.universal({
      postgres: sql`jsonb_build_array`,
      default: sql`json_array`
    }),
    args
  )
}
