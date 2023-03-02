import type {Expr} from './Expr'
import type {SelectMultiple, SelectSingle} from './query/Select'

type SelectionBase =
  // Side-effect of tables having a callable signature is that they expose
  // the Function prototype which we cancel out by marking them as unknown.
  // However this also marks them as enumerable...
  unknown | (() => any) | Expr<any> | SelectMultiple<any> | SelectSingle<any>
interface SelectionRecord extends Record<string, Selection> {}
export type Selection = SelectionBase | SelectionRecord

export namespace Selection {
  export declare const TableType: unique symbol
  export declare const CursorType: unique symbol

  export type Infer<T> = T extends {[TableType](): infer K}
    ? K
    : T extends {[CursorType](): infer K}
    ? K
    : T extends Expr<infer K>
    ? K
    : T extends Record<string, Selection>
    ? {[K in keyof T]: Infer<T[K]>}
    : T extends () => any
    ? never
    : unknown extends T
    ? never
    : T
  export type With<A, B> = Expr<Combine<A, B>>
  export type Combine<A, B> = Omit<A, keyof Infer<B>> & Infer<B>
}
