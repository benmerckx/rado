import {type HasSql, getQuery, getSql, hasSql} from '../Internal.ts'
import type {Either} from '../MetaData.ts'
import type {Query} from '../Query.ts'
import {type Sql, sql} from '../Sql.ts'
import {type Input, input} from './Input.ts'

function bool(impl: Sql): Sql<boolean> {
  return impl.mapWith(Boolean)
}

function binop(operator: string) {
  return (left: Input, right: Input): Sql<boolean> =>
    bool(sql`${input(left)} ${sql.unsafe(operator)} ${input(right)}`)
}

export const eq: <T>(left: Input<T>, right: Input<T>) => Sql<boolean> =
  binop('=')
export const ne: <T>(left: Input<T>, right: Input<T>) => Sql<boolean> =
  binop('<>')
export const gt: <T>(left: Input<T>, right: Input<T>) => Sql<boolean> =
  binop('>')
export const gte: <T>(left: Input<T>, right: Input<T>) => Sql<boolean> =
  binop('>=')
export const lt: <T>(left: Input<T>, right: Input<T>) => Sql<boolean> =
  binop('<')
export const lte: <T>(left: Input<T>, right: Input<T>) => Sql<boolean> =
  binop('<=')
export const like: (
  left: Input<string | null>,
  right: Input<string>
) => Sql<boolean> = binop('like')
export const notLike: (
  left: Input<string | null>,
  right: Input<string>
) => Sql<boolean> = binop('not like')
export const ilike: (
  left: Input<string | null>,
  right: Input<string>
) => Sql<boolean> = binop('ilike')
export const notILike: (
  left: Input<string | null>,
  right: Input<string>
) => Sql<boolean> = binop('not ilike')
export const arrayContains: <T>(
  left: Input<Array<T>>,
  right: Input<T>
) => Sql<boolean> = binop('@>')
export const arrayContained: <T>(
  left: Input<Array<T>>,
  right: Input<Array<T>>
) => Sql<boolean> = binop('<@')
export const arrayOverlaps: <T>(
  left: Input<Array<T>>,
  right: Input<Array<T>>
) => Sql<boolean> = binop('&&')

export function and(
  ...conditions: Array<undefined | Input<boolean>>
): Sql<boolean> {
  const inputs = conditions
    .filter((v): v is Input<boolean> => v !== undefined)
    .map(input)
  if (inputs.length === 0) return bool(sql`true`)
  if (inputs.length === 1) return bool(inputs[0])
  return bool(sql`(${sql.join(inputs, sql` and `)})`)
}

export function or(
  ...conditions: Array<undefined | Input<boolean>>
): Sql<boolean> {
  const inputs = conditions
    .filter((v): v is Input<boolean> => v !== undefined)
    .map(input)
  if (inputs.length === 0) return bool(sql`true`)
  if (inputs.length === 1) return bool(inputs[0])
  return bool(sql`(${sql.join(inputs, sql` or `)})`)
}

export function not(condition: Input<boolean>): Sql<boolean> {
  return bool(sql`not ${input(condition)}`)
}

export function inArray<T>(
  left: Input<T>,
  right: Query<T, any> | Input<Array<T>>
): Sql<boolean> {
  const value = (hasSql(right) ? getSql(right).getValue() : undefined) ?? right
  if (Array.isArray(value)) {
    if (value.length === 0) return sql`false`
    return bool(sql`${input(left)} in (${sql.join(value.map(input), sql`, `)})`)
  }
  return bool(sql`${input(left)} in ${input(<Input>right)}`)
}

export function notInArray<T>(
  left: Input<T>,
  right: Query<T, any> | Input<Array<T>>
): Sql<boolean> {
  const value = (hasSql(right) ? getSql(right).getValue() : undefined) ?? right
  if (Array.isArray(value)) {
    if (value.length === 0) return sql`true`
    return bool(
      sql`${input(left)} not in (${sql.join(value.map(input), sql`, `)})`
    )
  }
  return bool(sql`${input(left)} not in ${input(<Input>right)}`)
}

export function isNull(value: Input): Sql<boolean> {
  return bool(sql`${input(value)} is null`)
}

export function isNotNull(value: Input): Sql<boolean> {
  return bool(sql`${input(value)} is not null`)
}

export function between<T>(
  value: Input<T>,
  left: Input<T>,
  right: Input<T>
): Sql<boolean> {
  return bool(sql`${input(value)} between ${input(left)} and ${input(right)}`)
}

export function notBetween<T>(
  value: Input<T>,
  left: Input<T>,
  right: Input<T>
): Sql<boolean> {
  return bool(
    sql`${input(value)} not between ${input(left)} and ${input(right)}`
  )
}

export function asc<T>(input: HasSql<T>): Sql {
  return sql`${input} asc`
}

export function desc<T>(input: HasSql<T>): Sql {
  return sql`${input} desc`
}

export function distinct<T>(input: HasSql<T>): Sql {
  return sql`distinct ${input}`
}

export function when<In, Out>(
  compare: Input<In>,
  ...cases: Array<[condition: Input<In>, result: Input<Out>] | Input<Out>>
): Sql<Out>
export function when<Out>(
  ...cases: Array<[condition: Input<boolean>, result: Input<Out>] | Input<Out>>
): Sql<Out>
export function when<Out, In = boolean>(
  ...cases: Array<[condition: Input<In>, result: Input<Out>] | Input<Out>>
) {
  const compare =
    cases.length > 1 && !Array.isArray(cases[0])
      ? (cases.shift() as Input<In>)
      : undefined
  return sql.join([
    sql`case`,
    compare && input(compare),
    sql.join(
      cases.map((pair, index) => {
        if (Array.isArray(pair)) {
          const [condition, result] = pair
          return sql`when ${input(condition)} then ${input(result)}`
        }
        if (index === cases.length - 1) return sql`else ${input(pair)}`
        throw new Error('Unexpected else condition')
      })
    ),
    sql`end`
  ])
}

export function exists(query: Query<any, Either>): Sql<boolean> {
  return bool(sql`exists (${getQuery(query)})`)
}
