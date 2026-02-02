import {type HasQuery, type HasTarget, get, internal} from './Internal.ts'
import {type SelectionInput, selection} from './Selection.ts'
import {type Sql, sql} from './Sql.ts'
import {Field} from './expr/Field.ts'

export type VirtualQuery<Input> = VirtualTarget<Input> & HasQuery
export type VirtualTarget<Input> = Input & HasTarget

export function virtualTarget<Input>(
  alias: string,
  source: Input
): VirtualTarget<Input> {
  const targetSql = sql.identifier(alias)
  if (!source || typeof source !== 'object')
    throw new Error('Cannot alias a non-object')
  const {value} = get(source as object)
  if (value) {
    const expr = value
    const name = expr.alias
    if (!name) throw new Error('Cannot alias a virtual field without a name')
    const field = new Field(alias, name, expr)
    const data = get(field)
    data.target = targetSql
    return field as VirtualTarget<Input>
  }
  const aliased = Object.fromEntries(
    Object.entries(source).map(([key, value]) => {
      const {value: fieldValue} = get(value as object)
      if (!fieldValue) throw new Error('Invalid virtual field')
      return [key, new Field(alias, key, fieldValue)]
    })
  ) as Input
  return {
    [internal]: {
      target: targetSql,
      selection: selection(aliased as SelectionInput)
    },
    ...aliased
  }
}
