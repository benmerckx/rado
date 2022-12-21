import {CursorData} from './Cursor'
import {Expr, ExprData} from './Expr'

type SelectionBase = Expr<any> | {cursor: CursorData}
interface SelectionRecord extends Record<string, Selection> {}
export type Selection = SelectionBase | SelectionRecord

export namespace Selection {
  export function create(input: any): ExprData {
    if (input instanceof Expr) return input.expr
    // We're avoiding an `instanceof Collection` check here beause it would
    // cause a circular import
    if (input && typeof input.as === 'function') return input.fields.expr
    return ExprData.create(input)
  }
}
