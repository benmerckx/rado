// D1 runs each line as a statement, so blank lines and whole comment lines
// go, unless a string literal spans them
export function lines(query: string): string {
  // The quote that closes the literal or block comment the scan is in
  let open = ''
  const kept: Array<string> = []
  for (const line of query.split(/\r?\n/)) {
    if (!open && /^\s*(--.*)?$/.test(line)) continue
    kept.push(line)
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const pair = char + (line[i + 1] ?? '')
      if (open === '*/') {
        if (pair !== '*/') continue
        open = ''
        i++
      } else if (open) {
        if (char === open) open = ''
      } else if (pair === '--') break
      else if (pair === '/*') {
        open = '*/'
        i++
      } else if (`'"\``.includes(char)) open = char
    }
  }
  return kept.join('\n')
}
