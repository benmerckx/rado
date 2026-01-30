import {
  type HasQuery,
  getSql,
  hasSql,
  internalSelection,
  internalTarget
} from './Internal.ts'
import {type SelectionInput, selection} from './Selection.ts'
import {type Sql, sql} from './Sql.ts'
import {Field} from './expr/Field.ts'

export type VirtualQuery<Input> = VirtualTarget<Input> & HasQuery
export type VirtualTarget<Input> = Input & {readonly [internalTarget]: Sql}

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
    [internalSelection]: selection(aliased as SelectionInput),
    ...aliased
  }
}
