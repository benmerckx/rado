import {Column} from '../core/Column.ts'
import {sql} from '../core/Sql.ts'

export function id(name?: string): Column<number> {
  return new Column({
    name,
    type: sql.chunk('emitIdColumn', undefined)
  })
}

export function text(name?: string): Column<string | null> {
  return new Column({
    name,
    type: sql.chunk('emitTextColumn', undefined)
  })
}

export function int(name?: string): Column<number | null> {
  return new Column({
    name,
    type: sql.chunk('emitIntColumn', undefined)
  })
}

export function boolean(name?: string): Column<boolean | null> {
  return new Column({
    name,
    type: sql.chunk('emitBooleanColumn', undefined),
    mapFromDriverValue(value: unknown): boolean {
      if (typeof value === 'number') return value === 1
      return Boolean(value)
    }
  })
}
