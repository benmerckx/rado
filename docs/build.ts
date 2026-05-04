import {basename} from 'node:path'
import {codeToHtml} from 'shiki'

const input = process.argv[2] ?? 'docs/index.md'
const output = process.argv[3] ?? input.replace(/\.md$/, '.html')
const markdown = await Bun.file(input).text()

const title =
  markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? basename(input, '.md')

const body = await highlightCodeBlocks(Bun.markdown.html(markdown))

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --font-size: 0.90625rem;
      --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --font-title: Rubik, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --font-mono: JetBrainsMono, ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      --tx-1: #000000;
      --tx-2: #363636;
      --bg-1: #ffffff;
      --bg-2: #fafafa;
      --bg-3: #84adff;
      --line: #e6e6e6;
      --lk-1: #ff6030;
      --lk-2: #ff4f19;
      --lk-tx: #ffffff;
      --ac-1: #79ffe1;
      --ac-tx: #0c4047;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --tx-1: #ffffff;
        --tx-2: #eeeeee;
        --bg-1: #000000;
        --bg-2: #111111;
        --bg-3: #222222;
        --line: #262626;
        --lk-1: #ff4f19;
        --lk-2: #ff6030;
        --lk-tx: #ffffff;
        --ac-1: #7928ca;
        --ac-tx: #ffffff;
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html {
      scroll-behavior: smooth;
      font-family: var(--font-sans);
    }

    body {
      margin: 0 auto;
      max-width: 92ch;
      padding: 2.5rem 2rem;
      overflow-wrap: break-word;
      word-break: break-word;
      background: var(--bg-1);
      color: var(--tx-2);
      font-size: var(--font-size);
      line-height: 1.25rem;
    }

    main {
      padding: 0 0 4rem;
    }

    ::selection {
      background: var(--ac-1);
      color: var(--ac-tx);
    }

    h1,
    h2,
    h3 {
      font-family: var(--font-title);
      font-weight: 600;
      line-height: 1.2;
      letter-spacing: 0;
    }

    h1,
    h2 {
      color: var(--lk-1);
      font-size: 1rem;
      margin-bottom: 0.8rem;
    }

    h1 {
      padding-top: 0;
      margin-bottom: 1.5rem;
      font-size: 1.2rem;
    }

    h2 {
      margin-top: 3rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--line);
    }

    h3 {
      color: var(--tx-1);
      font-size: var(--font-size);
      margin: 1.5rem 0 0.8rem;
      padding-top: 1rem;
    }

    p,
    table,
    blockquote,
    ul,
    ol,
    details {
      margin-bottom: 1.5rem;
    }

    h1 + p {
      max-width: 62ch;
      color: var(--tx-1);
      font-size: 1rem;
      line-height: 1.45rem;
    }

    a {
      color: var(--lk-1);
      text-decoration: none;
    }

    a:hover {
      color: var(--lk-2);
    }

    table {
      width: 100%;
      display: block;
      overflow-x: auto;
      border-collapse: collapse;
      font-size: 0.9rem;
      border: 1px solid var(--line);
      border-radius: 4px;
    }

    th,
    td {
      padding: 0.5rem;
      border: 1px solid var(--line);
      vertical-align: top;
      text-align: left;
    }

    th {
      background: var(--bg-2);
      color: var(--tx-1);
    }

    tr:nth-child(even) {
      background: var(--bg-2);
    }

    details {
      padding: 0;
      border: 1px solid var(--line);
      border-left: 3px solid var(--bg-3);
      border-radius: 4px;
      background: var(--bg-1);
    }

    summary {
      cursor: pointer;
      color: var(--tx-1);
      font-family: var(--font-title);
      font-weight: 700;
      padding: 0.75rem 1rem;
      list-style-position: outside;
    }

    summary::marker {
      color: var(--lk-1);
    }

    details[open] {
      background: var(--bg-2);
    }

    details[open] summary {
      margin-bottom: 0.25rem;
      border-bottom: 1px solid var(--line);
    }

    details > :not(summary) {
      margin-left: 1rem;
      margin-right: 1rem;
    }

    details[open] > *:last-child {
      margin-bottom: 0;
    }

    pre {
      max-width: 100%;
      margin: 0 -1rem 1rem;
      overflow: auto;
      padding: 1rem;
      border-radius: 4px;
      border: 1px solid var(--line);
      background: var(--bg-2);
      line-height: 1.25rem;
    }

    code {
      font-family: var(--font-mono);
    }

    :not(pre) > code {
      padding: 3px 6px;
      border-radius: 4px;
      background: var(--bg-2);
      font-size: 0.9em;
    }

    pre code {
      background: inherit;
      color: inherit;
      font-size: 0.9em;
      border: 0;
      padding: 0;
    }

    pre.shiki {
      background: var(--bg-2) !important;
      color: var(--tx-2) !important;
    }

    .line {
      min-height: 1.25rem;
    }

    @media (prefers-color-scheme: dark) {
      .shiki,
      .shiki span {
        color: var(--shiki-dark) !important;
      }
    }

    blockquote {
      padding: 1.5rem;
      border-left: 5px solid var(--lk-1);
      background: var(--bg-2);
      color: var(--tx-2);
    }

    ul,
    ol {
      padding-left: 2rem;
    }

    li {
      margin-top: 0.4rem;
    }

    hr {
      border: 0;
      border-bottom: 1px solid var(--bg-3);
      margin: 1rem auto;
    }

    @media (max-width: 720px) {
      body {
        max-width: none;
        padding: 1.25rem 1rem;
      }
    }
  </style>
</head>
<body>
  <main>
${body}
  </main>
</body>
</html>
`

await Bun.write(output, html)
console.log(`Generated ${output}`)

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

async function highlightCodeBlocks(html: string) {
  const blocks = Array.from(
    html.matchAll(
      /<pre><code(?: class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/g
    )
  )
  const highlighted = await Promise.all(
    blocks.map(async match => {
      const language = normalizeLanguage(match[1] ?? 'text')
      const code = decodeHtml(match[2] ?? '')
      return codeToHtml(code, {
        lang: language,
        themes: {
          light: 'github-light',
          dark: 'github-dark'
        }
      })
    })
  )

  let result = ''
  let index = 0
  for (let i = 0; i < blocks.length; i++) {
    const match = blocks[i]!
    result += html.slice(index, match.index)
    result += highlighted[i]
    index = match.index! + match[0].length
  }
  return result + html.slice(index)
}

function decodeHtml(value: string) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#x27;', "'")
    .replaceAll('&amp;', '&')
}

function normalizeLanguage(language: string) {
  const lang = language.toLowerCase()
  if (lang === 'typescript') return 'ts'
  if (lang === 'javascript') return 'js'
  if (lang === 'shell') return 'sh'
  if (lang === 'postgres' || lang === 'postgresql' || lang === 'mysql')
    return 'sql'
  return lang || 'text'
}
