export interface ParsedType {
  base: string
  args: Array<number>
}

// A type as its name, its arguments and what follows them, as in
// timestamp(6) without time zone
export function parseType(type: string): ParsedType {
  const [, name, args, rest] = type.match(/^([^(]*)(?:\(([^)]*)\))?(.*)$/)!
  return {
    base: [name.trim(), rest.trim()].filter(Boolean).join(' '),
    args: args ? args.split(',').map(Number) : []
  }
}

// Same type with arguments at least as large, where fill gives the
// arguments a type has when they are left out
export function grows(
  from: ParsedType,
  to: ParsedType,
  fill: (base: string) => Array<number>
): boolean {
  const a = from.args.length ? from.args : fill(from.base)
  const b = to.args.length ? to.args : fill(to.base)
  if (from.base !== to.base || a.length !== b.length) return false
  // Precision and scale: neither the digits after nor before the point drop
  if (a.length === 2)
    return b[0] === Infinity || (a[1] <= b[1] && a[0] - a[1] <= b[0] - b[1])
  return a.every((arg, i) => arg <= b[i])
}

// Whether one is listed after the other in an ordered family
export function ranks(family: string, from: string, to: string): boolean {
  const list = family.split(' ')
  const position = list.indexOf(from)
  return position > -1 && list.indexOf(to) > position
}
