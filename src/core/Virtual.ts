import {
  type HasQuery,
  type HasSelection,
  type HasSql,
  type HasTarget,
  getQuery,
  getSelection,
  getSql,
  hasSql,
  internalQuery,
  internalTarget
} from './Internal.ts'
import {sql} from './Sql.ts'
import {Field} from './expr/Field.ts'

export type VirtualQuery<Input> = VirtualTarget<Input> & HasQuery

export function virtualQuery<Input>(
  name: string,
  from: HasSql | (HasSelection & HasQuery)
): VirtualQuery<Input> {
  if (hasSql(from))
    return new Proxy(
      {
        [internalTarget]: sql.identifier(name),
        [internalQuery]: from
      } as VirtualQuery<Input>,
      {
        get(target, property) {
          if (typeof property !== 'string')
            return target[property as keyof VirtualQuery<Input>]
          return new Field(name, property as string)
        }
      }
    )
  const fields = getSelection(from).makeVirtual<Input>(name)
  return Object.assign({[internalQuery]: getQuery(from)}, fields)
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
