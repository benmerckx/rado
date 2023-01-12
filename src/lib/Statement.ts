import {Sanitizer} from './Sanitizer'

enum TokenType {
  Raw = 'Raw',
  Identifier = 'Identifier',
  Value = 'Value',
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
}

const SEPARATE = ','
const WHITESPACE = ' '
const NEWLINE = '\n'

export class Statement {
  constructor(public tokens: Array<Token>) {}

  concat(...tokens: Array<Token | Statement>) {
    return new Statement(
      this.tokens.concat(
        ...tokens.flatMap(t => (t instanceof Statement ? t.tokens : [t]))
      )
    )
  }

  static create(from: string | Statement) {
    return typeof from === 'string' ? raw(from) : from
  }

  static tag(strings: ReadonlyArray<string>, ...params: Array<any>) {
    return new Statement(
      strings
        .flatMap((s, i) => [Token.Raw(s), Token.Value(params[i])])
        .slice(0, -1)
    )
  }

  space() {
    return this.concat(Token.Raw(WHITESPACE))
  }

  call(method: string, ...args: Array<Statement>) {
    return this.identifier(method).parenthesis(separated(args))
  }

  addCall(method: string, ...args: Array<Statement>) {
    return this.space().call(method, ...args)
  }

  add(addition: undefined | string | Statement) {
    if (!addition) return this
    if (addition instanceof Statement && addition.isEmpty()) return this
    return this.space().concat(Statement.create(addition))
  }

  addLine(addition: undefined | string | Statement) {
    if (!addition) return this
    if (addition instanceof Statement && addition.isEmpty()) return this
    return this.newline().concat(Statement.create(addition))
  }

  addIf(
    condition: any,
    addition: string | Statement | (() => string | Statement)
  ) {
    if (!condition) return this
    return this.add(typeof addition === 'function' ? addition() : addition)
  }

  indent() {
    return this.concat(Token.Indent())
  }

  dedent() {
    return this.concat(Token.Dedent())
  }

  newline() {
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

  raw(query: string) {
    if (!query) return this
    return this.concat(Token.Raw(query))
  }

  parenthesis(inner: string | Statement) {
    return this.raw('(')
      .indent()
      .newline()
      .concat(Statement.create(inner))
      .dedent()
      .newline()
      .raw(')')
  }

  addParenthesis(stmnt: string | Statement) {
    return this.space().parenthesis(stmnt)
  }

  separated(input: Array<Statement>, separator = SEPARATE) {
    return this.concat(
      ...input.flatMap((stmt, i) =>
        i === 0
          ? stmt.tokens
          : [Token.Raw(separator), Token.Raw(NEWLINE), ...stmt.tokens]
      )
    )
  }

  addSeparated(input: Array<Statement>, separator = SEPARATE) {
    return this.space().separated(input, separator)
  }

  isEmpty() {
    return (
      this.tokens.length === 0 ||
      (this.tokens.length === 1 &&
        this.tokens[0].type === TokenType.Raw &&
        this.tokens[0].data === '')
    )
  }

  compile(sanitizer: Sanitizer, formatInline = false): Statement.Compiled {
    let sql = '',
      params = [],
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
            params.push(token.data === undefined ? null : token.data)
          }
          break
        case TokenType.Indent:
          indent += '  '
          break
        case TokenType.Dedent:
          indent = indent.slice(0, -2)
          break
      }
    }
    return [sql, params]
  }
}

export namespace Statement {
  export type Compiled = [sql: string, params: Array<any>]
}

export function newline() {
  return new Statement([Token.Raw(NEWLINE)])
}

export function raw(raw: string) {
  return new Statement([Token.Raw(raw)])
}

export function identifier(name: string) {
  return new Statement([Token.Identifier(name)])
}

export function value(value: any) {
  return new Statement([Token.Value(value)])
}

export function empty() {
  return new Statement([])
}

export function parenthesis(stmnt: Statement) {
  return empty().parenthesis(stmnt)
}

export function call(method: string, ...args: Array<Statement>) {
  return identifier(method).parenthesis(separated(args))
}

export function separated(input: Array<Statement>, separator = SEPARATE) {
  return empty().separated(input, separator)
}
