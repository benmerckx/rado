import {Field} from './Field.ts'
import {getSql, hasSql} from './Internal.ts'
import type {SelectionInput} from './Selection.ts'

export function virtual<Input extends SelectionInput>(
  alias: string,
  source?: Input
): Input {
  if (source && hasSql(source)) {
    const expr = getSql(source)
    const name = expr.alias
    if (!name) throw new Error('Cannot alias a virtual field without a name')
    return <any>new Field(alias, name, expr)
  }
  return new Proxy(Object.create(null), {
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
