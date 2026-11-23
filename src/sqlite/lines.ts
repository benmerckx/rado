// D1 runs each line as a statement, so blank lines and whole comment lines
// go, unless a string literal spans them
export function lines(query: string): string {
  let quote = ''
  const kept: Array<string> = []
  for (const line of query.split('\n')) {
    if (!quote && /^\s*(--.*)?$/.test(line)) continue
    kept.push(line)
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (quote) {
        if (char === quote) quote = ''
      } else if (char === '-' && line[i + 1] === '-') break
      else if (`'"\``.includes(char)) quote = char
    }
  }
  return kept.join('\n')
}
