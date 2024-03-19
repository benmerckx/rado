import {Column} from '../core/Column.ts'
import {sql} from '../core/Sql.ts'

export function boolean(name?: string): Column<boolean | null> {
  return new Column({
    name,
    type: sql`integer`,
    mapFromDriverValue(value: number): boolean {
      return Number(value) === 1
    },
    mapToDriverValue(value: boolean): number {
      return value ? 1 : 0
    }
  })
}

export function integer(name?: string): Column<number | null> {
  return new Column({name, type: sql`integer`})
}

export function blob(name?: string): Column<Uint8Array | null> {
  return new Column({name, type: sql`blob`})
}

export function text(name?: string): Column<string | null> {
  return new Column({name, type: sql`text`})
}

export function real(name?: string): Column<number | null> {
  return new Column({name, type: sql`real`})
}

export function numeric(name?: string): Column<number | null> {
  return new Column({name, type: sql`numeric`})
}
