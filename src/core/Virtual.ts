import {Field} from './expr/Field.ts'
import {type HasQuery, getSql, hasSql, internalTarget} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'

export type VirtualQuery<Input> = VirtualTarget<Input> & HasQuery
export type VirtualTarget<Input> = Input & {readonly [internalTarget]: Sql}

function virtualFields(alias: string, source: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => {
      if (value && typeof value === 'object' && !hasSql(value))
        return [key, virtualFields(alias, value)]
      return [key, new Field(alias, key, getSql(value))]
    })
  )
}

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
  return {
    ...target,
    ...virtualFields(alias, source)
  }
}
