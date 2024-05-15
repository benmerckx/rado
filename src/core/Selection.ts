import {
  getField,
  getSql,
  hasField,
  internalSql,
  type HasSql,
  type HasTable
} from './Internal.ts'
import {sql, type Sql} from './Sql.ts'
import type {Table, TableRow} from './Table.ts'
import type {Expand} from './Types.ts'
import {virtual} from './Virtual.ts'

declare const nullable: unique symbol
export interface SelectionRecord extends Record<string, SelectionInput> {}
export type IsNullable = {[nullable]: true}
export type MakeNullable<T> = Expand<{[K in keyof T]: T[K] & IsNullable}>
export type SelectionInput = HasSql | HasTable | SelectionRecord
export type RowOfRecord<Input> = Expand<{
  [Key in keyof Input as Key extends string ? Key : never]: SelectionRow<
    Input[Key]
  >
}>
export type SelectionRow<Input> = Input extends HasSql<infer Value>
  ? Value
  : Input extends IsNullable
    ? RowOfRecord<Input> | null
    : Input extends SelectionRecord
      ? RowOfRecord<Input>
      : Input extends Table<infer Definition>
        ? TableRow<Definition>
        : never
/*
interface ResultContext {
  values: Array<unknown>
  index: number
}
interface Column {
  targetName?: string
  result(ctx: ResultContext): unknown
}
class SqlColumn implements Column {
  constructor(
    public sql: Sql,
    public targetName?: string
  ) {}

  result(ctx: ResultContext) {
    const value = ctx.values[ctx.index++]
    if (value === null) return value
    return this.sql.mapFromDriverValue?.(value) ?? value
  }
}

class ObjectColumn implements Column {
  constructor(
    public nullable: Set<string>,
    public entries: Array<[string, Column]>
  ) {}

  result(ctx: ResultContext) {
    const result: Record<string, unknown> = {}
    let isNullable = this.nullable.size > 0
    for (const entry of this.entries) {
      const name = entry[0]
      const col = entry[1]
      const value = col.result(ctx)
      result[name] = value
      if (isNullable) {
        if (value === null) {
          if (col.targetName && !this.nullable.has(col.targetName))
            isNullable = false
        } else {
          isNullable = false
        }
      }
    }
    if (isNullable) return null
    return result
  }
}*/

type Row = Array<{path: Array<string>; sql: Sql; targetName?: string}>

export class Selection implements HasSql {
  #input: SelectionInput
  #row: Row
  #nullable: Set<string>

  constructor(input: SelectionInput, nullable: Set<string>) {
    this.#input = input
    this.#row = this.#defineRow(input)
    this.#nullable = nullable
  }

  makeVirtual(name: string) {
    return virtual(name, this.#input)
  }

  #defineRow(input: SelectionInput, path: Array<string> = []): Row {
    const expr = getSql(input as HasSql)
    if (expr)
      return [
        {
          path,
          sql: expr,
          targetName: hasField(input) ? getField(input).targetName : undefined
        }
      ]
    return Object.entries(input).flatMap(([name, value]) =>
      this.#defineRow(value, path.concat(name))
    )
  }

  mapRow = (values: Array<unknown>) => {
    const result: any = {}
    let current = result
    let currentKey: string | undefined
    let isNullable = false
    for (let i = 0; i < this.#row.length; i++) {
      const {path, sql, targetName} = this.#row[i]
      let value = values[i]
      if (value !== null && sql.mapFromDriverValue)
        value = sql.mapFromDriverValue(value)
      if (path.length === 0) return value
      let obj = result
      let prev: any
      let key: string
      for (let j = 0; j < path.length - 1; j++) {
        key = path[j]
        prev = obj
        obj = obj[key] ?? (obj[key] = {})
      }
      if (current !== obj) {
        if (isNullable) prev[currentKey!] = null
        isNullable = this.#nullable.size > 0
        current = obj
        currentKey = key!
      }
      obj[path[path.length - 1]] = value
      if (isNullable) {
        if (value === null) {
          if (targetName && !this.#nullable.has(targetName)) isNullable = false
          else if (i === this.#row.length - 1) prev[currentKey!] = null
        } else {
          isNullable = false
        }
      }
    }
    return result
  }

  get [internalSql]() {
    return this.#selectionToSql(this.#input, new Set())
  }

  #selectionToSql(
    input: SelectionInput,
    names: Set<string>,
    name?: string
  ): Sql {
    const expr = getSql(input as HasSql)
    if (expr) {
      let exprName = name ?? expr.alias
      if (exprName) {
        // The bun:sqlite driver cannot handle multiple columns by the same name
        while (names.has(exprName)) exprName = `${exprName}_`
        names.add(exprName)
        if (hasField(input)) {
          const field = getField(input)
          if (field.fieldName === exprName) return expr
        }
        return sql`${expr} as ${sql.identifier(exprName)}`
      }
      return expr
    }
    return sql.join(
      Object.entries(input).map(([name, value]) =>
        this.#selectionToSql(value, names, name)
      ),
      sql`, `
    )
  }
}

export function selection(
  input: SelectionInput,
  nullable: Set<string> = new Set()
): Selection {
  return new Selection(input, nullable)
}
