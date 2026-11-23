const closing: Record<string, string> = {
  "'": "'",
  '"': '"',
  '`': '`',
  '[': ']',
  '/*': '*/'
}

// D1 runs each line of a script as one statement, so every statement goes on
// a line of its own: comments go, and line breaks outside string literals
// become spaces. A trigger body ends at its end, not at the statements in it.
export function lines(query: string): string {
  const result: Array<string> = []
  let current = ''
  // What closes the literal or block comment the scan is in
  let open = ''
  // Case and trigger begin blocks the scan is in
  let depth = 0
  let word = ''
  const close = () => {
    const lower = word.toLowerCase()
    const trigger = /^\s*create\s+(temp\w*\s+)?trigger\b/i.test(current)
    if (lower === 'case' || (lower === 'begin' && trigger)) depth++
    else if (lower === 'end' && depth > 0) depth--
    word = ''
  }
  for (let i = 0; i < query.length; i++) {
    const char = query[i]
    const pair = char + (query[i + 1] ?? '')
    if (open) {
      if (open === '*/' ? pair === '*/' : char === open) {
        if (open === '*/') i++
        else current += char
        open = ''
      } else if (open !== '*/') current += char
      continue
    }
    if (/\w/.test(char)) {
      word += char
      current += char
      continue
    }
    close()
    if (pair === '--') {
      while (i < query.length && query[i] !== '\n') i++
      current += ' '
    } else if (pair === '/*') {
      open = '*/'
      i++
      current += ' '
    } else if (closing[char]) {
      open = closing[char]
      current += char
    } else if (char === '\n' || char === '\r') current += ' '
    else if (char === ';' && depth === 0) {
      result.push(`${current.trim()};`)
      current = ''
    } else current += char
  }
  close()
  if (current.trim()) result.push(current.trim())
  return result.filter(statement => statement !== ';').join('\n')
}
