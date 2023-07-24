import {EV, Expr, ExprData} from './Expr.js'
import {
  Batch,
  Delete,
  InsertInto,
  Query,
  QueryData,
  RecursiveUnion,
  Select,
  Update
} from './Query.js'
import {Schema} from './Schema.js'
import {Selection} from './Selection.js'
import {Table, createTable} from './Table.js'
import {Target} from './Target.js'

/* Expressions */

export const value = Expr.value
export const and = Expr.and
export const or = Expr.or
export const not = <T>(a: EV<T>) => Expr.create(a).not()
export const is = <T>(a: EV<T>, b: EV<T>) => Expr.create(a).is(b)
export const isNot = <T>(a: EV<T>, b: EV<T>) => Expr.create(a).isNot(b)
export const isNull = <T>(a: EV<T>) => Expr.create(a).isNull()
export const isNotNull = <T>(a: EV<T>) => Expr.create(a).isNotNull()
export const isIn = <T>(a: EV<T>, b: EV<Array<T>> | Select<T>) =>
  Expr.create(a).isIn(b)
export const isNotIn = <T>(a: EV<T>, b: EV<Array<T>> | Select<T>) =>
  Expr.create(a).isNotIn(b)
export const isGreater = <T>(a: EV<T>, b: EV<T>) => Expr.create(a).isGreater(b)
export const isGreaterOrEqual = <T>(a: EV<T>, b: EV<T>) =>
  Expr.create(a).isGreaterOrEqual(b)
export const isLess = <T>(a: EV<T>, b: EV<T>) => Expr.create(a).isLess(b)
export const isLessOrEqual = <T>(a: EV<T>, b: EV<T>) =>
  Expr.create(a).isLessOrEqual(b)
export const add = (a: EV<number>, b: EV<number>, ...rest: Array<EV<number>>) =>
  Expr.create(a).add(b, ...rest)
export const subtract = (
  a: EV<number>,
  b: EV<number>,
  ...rest: Array<EV<number>>
) => Expr.create(a).subtract(b, ...rest)
export const multiply = (
  a: EV<number>,
  b: EV<number>,
  ...rest: Array<EV<number>>
) => Expr.create(a).multiply(b, ...rest)
export const divide = (
  a: EV<number>,
  b: EV<number>,
  ...rest: Array<EV<number>>
) => Expr.create(a).divide(b, ...rest)
export const remainder = (a: EV<number>, b: EV<number>) =>
  Expr.create(a).remainder(b)
export const concat = (a: EV<string>, b: EV<string>) => Expr.create(a).concat(b)
export const like = (a: EV<string>, b: EV<string>) => Expr.create(a).like(b)
export const glob = (a: EV<string>, b: EV<string>) => Expr.create(a).glob(b)
export const at = <T>(a: EV<Array<T>>, index: number) =>
  Expr.create(a).at(index)
export const includes = <T>(a: EV<Array<T>>, value: EV<T>) =>
  Expr.create(a).includes(value)

/* Queries */

export function withRecursive<Row>(initialSelect: Select<Row>) {
  return new RecursiveUnion<Row>(initialSelect[Query.Data])
}

export function alias<T extends Table<{}>>(table: T): Record<string, T> {
  return new Proxy(Object.create(null), {
    get(_, alias: string) {
      return createTable({...table[Table.Data], alias})
    }
  })
}

export function select<X extends Selection>(
  selection: X
): Select<Selection.Infer<X>> {
  return new Select(
    new QueryData.Select({
      selection: ExprData.create(selection)
    })
  )
}

export function from<Row>(source: Table<Row> | Select<Row>): Select<Row> {
  const target = Query.isQuery(source)
    ? new Target.Query(source[Query.Data])
    : new Target.Table(source[Table.Data])
  return new Select<Row>(
    new QueryData.Select({
      from: target,
      selection: new ExprData.Row(target)
    })
  )
}

export function update<Definition>(
  table: Table<Definition>
): Update<Definition> {
  return new Update<Definition>(
    new QueryData.Update({table: table[Table.Data]})
  )
}

export function insertInto<Definition>(
  table: Table<Definition>
): InsertInto<Definition> {
  return new InsertInto<Definition>(table[Table.Data])
}

export function deleteFrom<Row>(table: Table<Row>): Delete {
  return new Delete(new QueryData.Delete({table: table[Table.Data]}))
}

export function create(...tables: Array<Table<any>>): Batch {
  return new Batch(
    tables.flatMap(table => Schema.create(table[Table.Data]).queries)
  )
}
