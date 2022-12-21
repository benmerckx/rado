import {CursorData} from './Cursor'
import {Expr} from './Expr'

type SelectionBase = Expr<any> | {cursor: CursorData}
interface SelectionRecord extends Record<string, Selection> {}
export type Selection = SelectionBase | SelectionRecord
