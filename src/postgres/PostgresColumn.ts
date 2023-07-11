import {UnTyped} from '../define/Column.js'

export class PostgresColumn extends UnTyped {
  static readonly Column = Symbol()
}

export const column = new PostgresColumn()
