import type {Cursor} from './Cursor'
import type {Expr} from './Expr'

type SelectionBase =
  | (() => any)
  | Expr<any>
  | Cursor.SelectMultiple<any>
  | Cursor.SelectSingle<any>
interface SelectionRecord extends Record<string, Selection> {}
export type Selection = SelectionBase | SelectionRecord

export namespace Selection {
  export declare const __tableType: unique symbol
  export declare const __cursorType: unique symbol
  export type Infer<T> = T extends {[__tableType](): infer K}
    ? K
    : T extends {[__cursorType](): infer K}
    ? K
    : T extends Expr<infer K>
    ? K
    : T extends Record<string, Selection>
    ? {[K in keyof T as T[K] extends () => any ? never : K]: Infer<T[K]>}
    : T extends () => any
    ? never
    : T
  export type With<A, B> = Expr<Combine<A, B>>
  export type Combine<A, B> = Omit<A, keyof Infer<B>> & Infer<B>
}
