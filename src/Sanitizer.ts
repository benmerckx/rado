export interface Sanitizer {
  escapeValue(value: any): string
  escapeIdentifier(ident: string): string
}
