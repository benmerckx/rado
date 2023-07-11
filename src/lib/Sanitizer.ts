export interface Sanitizer {
  escapeValue(value: any): string
  escapeIdentifier(ident: string): string
  insertParam(index: number): string
  formatParamValue(paramValue: any): any
}
