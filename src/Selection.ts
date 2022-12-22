import type {Cursor} from './Cursor'
import type {Expr} from './Expr'

type SelectionBase =
  | Expr<any>
  | Cursor.SelectMultiple<any>
  | Cursor.SelectSingle<any>
interface SelectionRecord extends Record<string, Selection> {}
export type Selection = SelectionBase | SelectionRecord

export namespace Selection {
  export type Infer<T> = T extends Cursor.Filterable<Array<infer K>>
    ? K
    : T extends Cursor.Filterable<infer K>
    ? K
    : T extends Expr<infer K>
    ? K
    : T extends Record<string, Selection>
    ? {[K in keyof T]: Infer<T[K]>}
    : T
  export type With<A, B> = Expr<Combine<A, B>>
  export type Combine<A, B> = Omit<A, keyof Infer<B>> & Infer<B>
}
