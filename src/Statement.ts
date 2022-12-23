import {Sanitizer} from './Sanitizer'

const enum TokenType {
  Raw = 'Raw',
  Ident = 'Ident',
  Value = 'Value'
}

class Token {
  constructor(public type: TokenType, public data: any) {}

  static Raw(data: string) {
    return new Token(TokenType.Raw, data)
  }

  static Ident(data: string) {
    return new Token(TokenType.Ident, data)
  }

  static Value(data: any) {
    return new Token(TokenType.Value, data)
  }
}

const SEPARATE = ', '
const WHITESPACE = ' '

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

  space() {
    return this.concat(Token.Raw(WHITESPACE))
  }

  call(method: string, ...args: Array<Statement>) {
    return this.ident(method).parenthesis(separated(args))
  }

  addCall(method: string, ...args: Array<Statement>) {
    return this.space().call(method, ...args)
  }

  add(addition: undefined | string | Statement) {
    if (!addition) return this
    if (addition instanceof Statement && addition.isEmpty()) return this
    return this.space().concat(Statement.create(addition))
  }

  addIf(condition: any, addition: string | Statement) {
    if (!condition) return this
    return this.add(addition)
  }

  ident(name: string) {
    return this.concat(Token.Ident(name))
  }

  addIdent(name: string) {
    return this.space().ident(name)
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
    return this.raw('(').concat(Statement.create(inner)).raw(')')
  }

  addParenthesis(stmnt: string | Statement) {
    return this.space().parenthesis(stmnt)
  }

  separated(input: Array<Statement>, separator = SEPARATE) {
    return this.concat(
      ...input.flatMap((stmt, i) =>
        i === 0 ? stmt.tokens : [Token.Raw(separator), ...stmt.tokens]
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

  compile(sanitizer: Sanitizer, formatInline = false): [string, Array<any>] {
    let sql = '',
      params = []
    for (const token of this.tokens) {
      switch (token.type) {
        case TokenType.Raw:
          sql += token.data
          break
        case TokenType.Ident:
          sql += sanitizer.escapeIdent(token.data)
          break
        case TokenType.Value:
          if (formatInline) {
            sql += sanitizer.escapeValue(token.data)
          } else {
            sql += '?'
            params.push(token.data === undefined ? null : token.data)
          }
          break
      }
    }
    return [sql, params]
  }
}

export function raw(raw: string) {
  return new Statement([Token.Raw(raw)])
}

export function ident(name: string) {
  return new Statement([Token.Ident(name)])
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
  return ident(method).parenthesis(separated(args))
}

export function separated(input: Array<Statement>, separator = SEPARATE) {
  return empty().separated(input, separator)
}
