import {ParamData, ParamType} from './Param'
import {Sanitizer} from './Sanitizer'

enum TokenType {
  Raw = 'Raw',
  Identifier = 'Identifier',
  Value = 'Value',
  Param = 'Param',
  Indent = 'Indent',
  Dedent = 'Dedent'
}

class Token {
  constructor(public type: TokenType, public data: any) {}

  static Raw(data: string) {
    return new Token(TokenType.Raw, data)
  }

  static Indent() {
    return new Token(TokenType.Indent, null)
  }

  static Dedent() {
    return new Token(TokenType.Dedent, null)
  }

  static Identifier(data: string) {
    return new Token(TokenType.Identifier, data)
  }

  static Value(data: any) {
    return new Token(TokenType.Value, data)
  }

  static Param(name: string) {
    return new Token(TokenType.Param, name)
  }
}

const SEPARATE = ', '
const WHITESPACE = ' '
const NEWLINE = '\n'

export interface CompileOptions {
  formatInline?: boolean
  spaces?: number
}

export class Statement {
  constructor(public tokens: Array<Token> = []) {}

  concat(...tokens: Array<Token>) {
    this.tokens.push(...tokens)
    return this
  }

  static tag(strings: ReadonlyArray<string>, params: Array<Statement>) {
    return new Statement(
      strings.flatMap((s, i) => {
        const param = params[i]
        return [Token.Raw(s)].concat(param ? param.tokens : [])
      })
    )
  }

  space() {
    if (this.tokens.length === 0) return this
    return this.raw(WHITESPACE)
  }

  add(addition: undefined | string) {
    if (!addition) return this
    return this.space().raw(addition)
  }

  addLine(addition: undefined | string) {
    if (!addition) return this
    return this.newline().add(addition)
  }

  indent() {
    return this.concat(Token.Indent())
  }

  dedent() {
    return this.concat(Token.Dedent())
  }

  newline(ignore = false) {
    if (ignore) return this
    return this.raw(NEWLINE)
  }

  identifier(name: string) {
    return this.concat(Token.Identifier(name))
  }

  addIdentifier(name: string) {
    return this.space().identifier(name)
  }

  value(value: any) {
    return this.concat(Token.Value(value))
  }

  addValue(value: any) {
    return this.space().value(value)
  }

  param(name: string) {
    return this.concat(Token.Param(name))
  }

  addParam(name: string) {
    return this.space().param(name)
  }

  raw(query: string) {
    if (!query) return this
    return this.concat(Token.Raw(query))
  }

  openParenthesis() {
    return this.raw('(').indent().newline()
  }

  closeParenthesis() {
    return this.dedent().newline().raw(')')
  }

  *call<T>(parts: Array<T>, separator = SEPARATE) {
    this.openParenthesis()
    yield* this.separate(parts, separator)
    this.closeParenthesis()
  }

  *separate<T>(parts: Array<T>, separator = SEPARATE) {
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) this.raw(separator).newline()
      yield parts[i]
    }
  }

  isEmpty() {
    return (
      this.tokens.length === 0 ||
      (this.tokens.length === 1 &&
        this.tokens[0].type === TokenType.Raw &&
        this.tokens[0].data === '')
    )
  }

  compile(sanitizer: Sanitizer, formatInline = false): CompiledStatement {
    let sql = '',
      paramData: Array<ParamData> = [],
      indent = ''
    for (const token of this.tokens) {
      switch (token.type) {
        case TokenType.Raw:
          if (token.data === NEWLINE) sql += NEWLINE + indent
          else sql += token.data
          break
        case TokenType.Identifier:
          sql += sanitizer.escapeIdentifier(token.data)
          break
        case TokenType.Value:
          if (formatInline) {
            sql += sanitizer.escapeValue(token.data)
          } else {
            sql += '?'
            paramData.push(ParamData.Value(token.data))
          }
          break
        case TokenType.Param:
          sql += '?'
          paramData.push(ParamData.Named(token.data))
          break
        case TokenType.Indent:
          indent += '  '
          break
        case TokenType.Dedent:
          indent = indent.slice(0, -2)
          break
      }
    }
    return new CompiledStatement(sanitizer, sql, paramData)
  }
}

export class CompiledStatement {
  constructor(
    public sanitizer: Sanitizer,
    public sql: string,
    private paramData: Array<ParamData>
  ) {}

  params(input?: Record<string, any>): Array<any> {
    return this.paramData.map(param => {
      if (param.type === ParamType.Named) {
        if (input && param.name in input)
          return this.sanitizer.formatParamValue(input[param.name])
        throw new TypeError(`Missing parameter ${param.name}`)
      }
      return this.sanitizer.formatParamValue(param.value)
    })
  }

  toString() {
    return this.sql
  }
}
