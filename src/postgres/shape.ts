import {references} from '../core/Catalog.ts'
import type {Database} from '../core/Database.ts'
import type {Shape} from '../core/Shape.ts'
import type {Gen} from '../core/Transaction.ts'
import {catalog} from './catalog.ts'

const {fromEntries} = Object

export const actions: Record<string, string> = {
  a: 'no action',
  r: 'restrict',
  c: 'cascade',
  n: 'set null',
  d: 'set default'
}

// The table in the form push compares
export function* shape(
  tx: Database,
  name: string,
  schema: string
): Gen<Shape | undefined> {
  const [table] = yield* catalog(tx, schema, [name])
  if (!table) return undefined
  const columns = fromEntries(
    table.columns.map(column => [
      column.name,
      {
        type: column.type,
        notNull: column.notNull,
        default: column.default,
        extra: column.identity
      }
    ])
  )
  const constraints = fromEntries(
    table.keys.map(key => [key.name, key.definition])
  )
  const indexes = fromEntries(
    table.indexes.map(({name, unique, definition}) => [
      name,
      (unique ? 'unique ' : '') +
        definition.slice(definition.indexOf(' USING '))
    ])
  )
  return {
    columns,
    constraints,
    indexes,
    foreignKeys: references(table.foreignKeys).map(key => ({
      ...key,
      onDelete: actions[key.onDelete],
      onUpdate: actions[key.onUpdate]
    }))
  }
}
