import type {HasTable} from '../core/Internal.ts'

export interface Diff {
  diffTable(table: HasTable): Promise<Array<string>>
}
