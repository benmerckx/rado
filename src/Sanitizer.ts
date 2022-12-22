export interface Sanitizer {
  escapeValue(value: any): string
  escapeIdent(ident: string): string
}
