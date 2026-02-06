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
  const target = <any>{
    [internal]: {target: sql.identifier(alias)}
  }
  if (!source || typeof source !== 'object')
    throw new Error('Cannot alias a non-object')
  const {value} = get(source as object)
  if (value) {
    const expr = value
    const name = expr.alias
    if (!name) throw new Error('Cannot alias a virtual field without a name')
    const field = <any>new Field(alias, name, expr)
    return Object.assign(field, {
      [internal]: {
        ...get(field),
        ...target[internal]
      }
    })
  }
  const aliased = Object.fromEntries(
    Object.entries(source).map(([key, value]) => {
      const {value: fieldValue} = get(value as object)
      if (!fieldValue) throw new Error('Invalid virtual field')
      return [key, new Field(alias, key, fieldValue)]
    })
  ) as Input
  target[internal].selection = selection(aliased as SelectionInput)
  return {
    ...target,
    ...aliased
  }
}
