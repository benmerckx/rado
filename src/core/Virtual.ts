import {
  type HasQuery,
  type HasTarget,
  getSql,
  hasSql,
  internalQuery,
  internalTarget
} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'
import {Field} from './expr/Field.ts'

export type VirtualQuery<Input> = VirtualTarget<Input> & HasQuery

export function virtualQuery<Input>(
  name: string,
  source: Input,
  query: Sql
): VirtualQuery<Input> {
  return Object.assign(virtualTarget(name, source), {[internalQuery]: query})
}

export type VirtualTarget<Input> = Input & HasTarget

export function virtualTarget<Input>(
  alias: string,
  source: Input
): VirtualTarget<Input> {
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
