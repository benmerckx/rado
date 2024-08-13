import {type HasTarget, getSql, hasSql, internalTarget} from './Internal.ts'
import {sql} from './Sql.ts'
import {Field} from './expr/Field.ts'

export function virtual<Input>(
  alias: string,
  source?: Input
): Input & HasTarget {
  const target = <any>{[internalTarget]: sql.identifier(alias)}
  if (source && hasSql(source)) {
    const expr = getSql(source)
    const name = expr.alias
    if (!name) throw new Error('Cannot alias a virtual field without a name')
    return Object.assign(new Field(alias, name, expr), target)
  }
  return new Proxy(target, {
    get(target, field: string | symbol) {
      if (field in target) return target[field]
      const from = (<any>source)?.[field]
      if (typeof field !== 'string') return from
      return (target[field] = new Field(
        alias,
        field,
        from ? getSql(from) : undefined
      ))
    }
  })
}
