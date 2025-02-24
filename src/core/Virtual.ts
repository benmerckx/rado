import {type HasTarget, getSql, hasSql, internalTarget} from './Internal.ts'
import {sql} from './Sql.ts'
import {Field} from './expr/Field.ts'

export function virtual<Input>(
  alias: string,
  source: Input
): Input & HasTarget {
  const target = <any>{
    [internalTarget]: sql.identifier(alias)
  }
  if (!source || typeof source !== 'object')
    throw new Error('Cannot alias a non-object')
  if (hasSql(source)) {
    const expr = getSql(source)
    const name = expr.alias
    if (!name) throw new Error('Cannot alias a virtual field without a name')
    return Object.assign(new Field(alias, name, expr), target)
  }
  const aliased = Object.fromEntries(
    Object.entries(source).map(([key, value]) => {
      return [key, new Field(alias, key, getSql(value))]
    })
  ) as Input
  return {
    [internalTarget]: sql.identifier(alias),
    ...aliased
  }
}
