import {type Input, input} from './expr/Input.ts'
import {getTable} from './Internal.ts'
import {type Table, type TableDefinition, alias} from './Table.ts'

const {assign} = Object

// A table valued function, as `name(...args) as alias`, such as sqlite's
// pragma functions or postgres' generate_series
export function call<Definition extends TableDefinition, Alias extends string>(
  table: Table<Definition>,
  name: Alias,
  ...args: Array<Input<unknown>>
): Table<Definition, Alias> {
  const called = alias(table, name)
  assign(getTable(called), {args: args.map(arg => input(arg))})
  return called
}
