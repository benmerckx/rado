#!/usr/bin/env bun
/**
 * Builds the rado docs: markdown in docs/ -> static html in docs/dist.
 *
 *   bun docs/build.ts          build once
 *   bun docs/build.ts --serve  build, serve on http://localhost:4000 and watch
 */

import {watch} from 'node:fs'
import {mkdir} from 'node:fs/promises'
import {dirname, join, relative} from 'node:path'

const docsDir = import.meta.dir
const outDir = join(docsDir, 'dist')
const repoUrl = 'https://github.com/benmerckx/rado'
const siteName = 'rado'

// #region Navigation

interface NavItem {
  text: string
  href: string
}

interface NavGroup {
  text: string
  items: Array<NavItem>
}

const nav: Array<NavGroup> = [
  {
    text: 'Start here',
    items: [
      {text: 'Introduction', href: 'index.html'},
      {text: 'Getting started', href: 'getting-started.html'},
      {text: 'Drivers', href: 'drivers.html'}
    ]
  },
  {
    text: 'Schema',
    items: [
      {text: 'Tables', href: 'schema/tables.html'},
      {text: 'SQLite columns', href: 'schema/columns-sqlite.html'},
      {text: 'PostgreSQL columns', href: 'schema/columns-postgres.html'},
      {text: 'MySQL columns', href: 'schema/columns-mysql.html'},
      {text: 'Universal columns', href: 'schema/columns-universal.html'},
      {
        text: 'Indexes & constraints',
        href: 'schema/indexes-and-constraints.html'
      },
      {text: 'Views', href: 'schema/views.html'},
      {
        text: 'Schemas & enums',
        href: 'schema/postgres-schemas-and-enums.html'
      },
      {text: 'Custom column types', href: 'schema/custom-types.html'}
    ]
  },
  {
    text: 'Queries',
    items: [
      {text: 'Select', href: 'queries/select.html'},
      {text: 'Joins', href: 'queries/joins.html'},
      {text: 'Insert', href: 'queries/insert.html'},
      {text: 'Update', href: 'queries/update.html'},
      {text: 'Delete', href: 'queries/delete.html'},
      {text: 'Filter operators', href: 'queries/operators.html'},
      {text: 'Aggregates', href: 'queries/aggregates.html'},
      {text: 'Include', href: 'queries/include.html'},
      {text: 'JSON', href: 'queries/json.html'},
      {text: 'Set operations', href: 'queries/set-operations.html'},
      {text: 'Subqueries & CTEs', href: 'queries/subqueries-and-ctes.html'},
      {text: 'The sql tag', href: 'queries/sql.html'}
    ]
  },
  {
    text: 'Running queries',
    items: [
      {
        text: 'Transactions & batch',
        href: 'runtime/transactions-and-batch.html'
      },
      {text: 'Prepared statements', href: 'runtime/prepared-statements.html'},
      {text: 'Migrations', href: 'runtime/migrations.html'},
      {text: 'Universal queries', href: 'runtime/universal-queries.html'}
    ]
  },
  {
    text: 'Background',
    items: [{text: 'Coming from Drizzle', href: 'drizzle.html'}]
  }
]

const flatNav: Array<NavItem> = nav.flatMap(group => group.items)

// #endregion

// #region Helpers

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function unescapeHtml(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
}

/** Rewrite relative markdown links to their html counterparts. */
function rewriteLinks(markdown: string): string {
  return markdown.replace(
    /(\]\()(?!https?:\/\/|#)([^)#\s]+)\.md(#[^)]*)?\)/g,
    (_, open, path: string, anchor = '') => {
      return `${open}${path}.html${anchor})`
    }
  )
}

// #endregion

// #region Syntax highlighting

const keywords: Record<string, ReadonlyArray<string>> = {
  ts: 'import export from const let var function return await async if else for while do switch case break continue new class extends implements interface type enum namespace declare as in of typeof instanceof keyof readonly satisfies void null undefined true false this super static public private protected throw try catch finally yield default delete'.split(
    ' '
  ),
  sql: 'add all alter and any as asc begin between by cascade case check column commit conflict constraint cross cycle deferrable desc distinct do each else end escape exists fetch first for foreign full generated group having identity if ilike in index initially inner instead is isnull join key last lateral left like limit local materialized natural next no nothing notnull null of offset on only or order outer over partition plan pragma precision primary recursive references regexp rename replace restrict right rollback row rows savepoint schema table temporary then to transaction trigger unique using view virtual when window with without'.split(
    ' '
  ),
  sh: 'npm npx bun bunx pnpm yarn deno node cd echo export'.split(' ')
}
keywords.tsx = keywords.ts
keywords.js = keywords.ts
keywords.typescript = keywords.ts
keywords.bash = keywords.sh
keywords.shell = keywords.sh

/** SQL statement words get their own distinct color. */
const sqlStatements =
  'select insert update delete from where set values into returning create drop truncate merge union intersect except not default'.split(
    ' '
  )

/** Query builder methods highlighted as sql in ts code (after a dot). */
const sqlMethods =
  'select selectDistinct selectDistinctOn from where insert into values update set delete leftJoin rightJoin innerJoin fullJoin crossJoin leftJoinLateral innerJoinLateral crossJoinLateral groupBy orderBy having limit offset union unionAll intersect intersectAll except exceptAll returning onConflictDoNothing onConflictDoUpdate onDuplicateKeyUpdate with withRecursive'.split(
    ' '
  )

function highlight(code: string, lang: string): string {
  const words = keywords[lang] ?? []
  const isSql = lang === 'sql'
  const isTs = keywords[lang] === keywords.ts
  const pattern =
    /(\/\/[^\n]*|--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][A-Za-z0-9_$]*)/g
  return code.replace(
    pattern,
    (match, comment, string, number, identifier, offset: number) => {
      if (comment) {
        const isComment =
          comment.startsWith('/*') ||
          (comment.startsWith('//') && lang !== 'sh' && !isSql) ||
          (comment.startsWith('--') && isSql) ||
          (comment.startsWith('#') && (lang === 'sh' || lang === 'bash'))
        if (isComment)
          return `<span class="tok-cm">${escapeHtml(comment)}</span>`
        return escapeHtml(match)
      }
      if (string) return `<span class="tok-str">${escapeHtml(string)}</span>`
      if (number) return `<span class="tok-num">${escapeHtml(number)}</span>`
      if (identifier) {
        if (isSql && sqlStatements.includes(identifier.toLowerCase()))
          return `<span class="tok-sql">${escapeHtml(identifier)}</span>`
        if (isTs && code[offset - 1] === '.' && sqlMethods.includes(identifier))
          return `<span class="tok-sql">${escapeHtml(identifier)}</span>`
        const check = isSql ? identifier.toLowerCase() : identifier
        if (words.includes(check))
          return `<span class="tok-kw">${escapeHtml(identifier)}</span>`
        return escapeHtml(identifier)
      }
      return escapeHtml(match)
    }
  )
}

function highlightCodeBlocks(html: string): string {
  return html.replace(
    /<pre><code class="language-([\w-]+)">([\s\S]*?)<\/code><\/pre>/g,
    (_, lang: string, escaped: string) => {
      const code = unescapeHtml(escaped)
      const highlighted = highlight(code, lang)
      return [
        '<div class="codeblock">',
        `<button class="copy" type="button" aria-label="Copy code">Copy</button>`,
        `<pre><code class="language-${lang}">${highlighted}</code></pre>`,
        '</div>'
      ].join('')
    }
  )
}

// #endregion

// #region Headings & table of contents

interface Heading {
  level: number
  id: string
  text: string
}

function addHeadingIds(html: string): {
  html: string
  headings: Array<Heading>
} {
  const headings: Array<Heading> = []
  const seen = new Map<string, number>()
  const result = html.replace(
    /<h([1-3])>([\s\S]*?)<\/h\1>/g,
    (_, level: string, inner: string) => {
      const text = inner.replace(/<[^>]*>/g, '')
      let id = slugify(text)
      const count = seen.get(id) ?? 0
      seen.set(id, count + 1)
      if (count > 0) id = `${id}-${count}`
      headings.push({level: Number(level), id, text})
      const anchor = `<a class="anchor" href="#${id}" aria-hidden="true">#</a>`
      return `<h${level} id="${id}">${inner}${anchor}</h${level}>`
    }
  )
  return {html: result, headings}
}

function renderToc(headings: Array<Heading>): string {
  const entries = headings.filter(h => h.level === 2 || h.level === 3)
  if (entries.length < 2) return ''
  const links = entries
    .map(
      h => `<a class="toc-${h.level}" href="#${h.id}">${escapeHtml(h.text)}</a>`
    )
    .join('\n')
  return `<aside class="toc"><div class="toc-inner"><span class="toc-title">On this page</span>\n${links}</div></aside>`
}

// #endregion

// #region Page template

function renderSidebar(prefix: string, current: string): string {
  const groups = nav
    .map(group => {
      const items = group.items
        .map(item => {
          const active = item.href === current ? ' class="active"' : ''
          return `<a${active} href="${prefix}${item.href}">${escapeHtml(item.text)}</a>`
        })
        .join('\n')
      return `<div class="nav-group"><span class="nav-title">${escapeHtml(group.text)}</span>\n${items}</div>`
    })
    .join('\n')
  return `<nav class="sidebar">${groups}</nav>`
}

function renderPager(prefix: string, current: string): string {
  const index = flatNav.findIndex(item => item.href === current)
  if (index === -1) return ''
  const prev = flatNav[index - 1]
  const next = flatNav[index + 1]
  const prevLink = prev
    ? `<a class="pager-prev" href="${prefix}${prev.href}"><span>Previous</span>${escapeHtml(prev.text)}</a>`
    : '<span></span>'
  const nextLink = next
    ? `<a class="pager-next" href="${prefix}${next.href}"><span>Next</span>${escapeHtml(next.text)}</a>`
    : '<span></span>'
  return `<div class="pager">${prevLink}${nextLink}</div>`
}

function renderPage(input: {
  title: string
  content: string
  toc: string
  current: string
  prefix: string
}): string {
  const {title, content, toc, current, prefix} = input
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - ${siteName}</title>
<link rel="icon" type="image/svg+xml" href="${prefix}favicon.svg">
<link rel="stylesheet" href="${prefix}style.css">
</head>
<body>
<header class="topbar">
  <a class="brand" href="${prefix}index.html">Rado</a>
  <a class="github" href="${repoUrl}">GitHub</a>
</header>
<div class="shell">
${renderSidebar(prefix, current)}
<script>
{
  const sidebar = document.querySelector('.sidebar')
  sidebar.scrollTop = Number(sessionStorage.getItem('sidebar-scroll'))
  addEventListener('beforeunload', () => {
    sessionStorage.setItem('sidebar-scroll', sidebar.scrollTop)
  })
}
</script>
<main class="content">
<article>
${content}
</article>
${renderPager(prefix, current)}
</main>
${toc}
</div>
<script>
for (const button of document.querySelectorAll('.codeblock .copy')) {
  button.addEventListener('click', () => {
    const code = button.parentElement.querySelector('code')
    navigator.clipboard.writeText(code.innerText)
    button.textContent = 'Copied!'
    setTimeout(() => (button.textContent = 'Copy'), 1500)
  })
}
</script>
</body>
</html>`
}

// #endregion

// #region Favicon

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#ff6030"/>
<text x="32" y="46" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="40" font-weight="700" fill="#ffffff">R</text>
</svg>
`

// #endregion

// #region Styles (palette borrowed from ben.mk)

const fontFiles = [
  '@fontsource/inter/files/inter-latin-400-normal.woff2',
  '@fontsource/inter/files/inter-latin-500-normal.woff2',
  '@fontsource/inter/files/inter-latin-600-normal.woff2',
  '@fontsource/inter/files/inter-latin-700-normal.woff2',
  '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2',
  '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2'
]

const fontFaces = fontFiles
  .map(file => {
    const name = file.split('/').at(-1)!
    const family = name.startsWith('inter') ? 'Inter' : 'JetBrains Mono'
    const weight = name.match(/-(\d+)-normal/)![1]
    return `@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${weight};
  font-display: block;
  src: url('fonts/${name}') format('woff2');
}`
  })
  .join('\n\n')

const styles = /* css */ `
${fontFaces}

:root {
  --tx-1: #000000;
  --tx-2: #363636;
  --tx-3: #6b6b6b;
  --bg-1: #ffffff;
  --bg-2: #fafafa;
  --bg-3: #84adff;
  --lk-1: #ff6030;
  --lk-2: #ff4f19;
  --ac-1: #79ffe1;
  --ac-tx: #0c4047;
  --border: #ebebeb;
  --code-bg: #111111;
  --code-tx: #eeeeee;
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-title: var(--font-sans);
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --topbar-height: 4rem;
}

@media (prefers-color-scheme: dark) {
  :root {
    --tx-1: #ffffff;
    --tx-2: #eeeeee;
    --tx-3: #9b9b9b;
    --bg-1: #000000;
    --bg-2: #111111;
    --bg-3: #222222;
    --lk-1: #ff4f19;
    --lk-2: #ff6030;
    --ac-1: #7928ca;
    --ac-tx: #ffffff;
    --border: #222222;
  }
}

* { margin: 0; padding: 0; box-sizing: border-box; }

::selection { background: var(--ac-1); color: var(--ac-tx); }

html { scroll-padding-top: calc(var(--topbar-height) + 1rem); }

body {
  font-family: var(--font-sans);
  font-size: 0.9375rem;
  line-height: 1.65;
  color: var(--tx-2);
  background: var(--bg-1);
}

/* Top bar */

.topbar {
  position: fixed;
  inset: 0 0 auto 0;
  height: var(--topbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.5rem;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-1) 85%, transparent);
  backdrop-filter: blur(12px);
  z-index: 10;
}

.brand {
  font-family: var(--font-title);
  font-weight: 700;
  font-size: 1.25rem;
  color: var(--lk-1);
  text-decoration: none;
}

.github {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--tx-2);
  text-decoration: none;
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
}

.github:hover { color: var(--lk-1); border-color: var(--lk-1); }

/* Layout */

.shell {
  display: grid;
  grid-template-columns: 17rem minmax(0, 1fr) 14rem;
  gap: 2rem;
  max-width: 90rem;
  margin: 0 auto;
  padding: var(--topbar-height) 1.5rem 0;
}

/* Sidebar */

.sidebar {
  position: sticky;
  top: var(--topbar-height);
  height: calc(100vh - var(--topbar-height));
  overflow-y: auto;
  padding: 1.5rem 0.75rem 2rem 0;
  border-right: 1px solid var(--border);
}

.nav-group { margin-bottom: 1.5rem; }

.nav-title {
  display: block;
  font-family: var(--font-title);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--tx-1);
  margin-bottom: 0.375rem;
  padding: 0 0.625rem;
}

.sidebar a {
  display: block;
  padding: 0.3125rem 0.625rem;
  font-size: 0.875rem;
  color: var(--tx-3);
  text-decoration: none;
  border-radius: 0.375rem;
}

.sidebar a:hover { color: var(--tx-1); background: var(--bg-2); }

.sidebar a.active {
  color: var(--lk-1);
  background: color-mix(in srgb, var(--lk-1) 8%, transparent);
  font-weight: 500;
}

/* Content */

.content { padding: 2.5rem 0 4rem; min-width: 0; }

article { max-width: 46rem; }

article > * + * { margin-top: 1.125rem; }

h1, h2, h3, h4 {
  font-family: var(--font-title);
  color: var(--tx-1);
  line-height: 1.3;
  position: relative;
}

h1 { font-size: 1.875rem; font-weight: 700; }
h2 { font-size: 1.375rem; font-weight: 600; margin-top: 2.5rem; }
h3 { font-size: 1.125rem; font-weight: 600; margin-top: 2rem; }
h4 { font-size: 1rem; font-weight: 600; }

h2 { padding-top: 1rem; border-top: 1px solid var(--border); }

.anchor {
  position: absolute;
  margin-left: 0.375rem;
  color: var(--tx-3);
  text-decoration: none;
  opacity: 0;
}

h1:hover .anchor, h2:hover .anchor, h3:hover .anchor { opacity: 1; }
.anchor:hover { color: var(--lk-1); }

a { color: var(--lk-1); text-decoration: none; }
a:hover { color: var(--lk-2); }

strong { color: var(--tx-1); }

ul, ol { padding-left: 1.5rem; }
li + li { margin-top: 0.25rem; }

blockquote {
  padding: 0.75rem 1.25rem;
  background: var(--bg-2);
  border-left: 3px solid var(--lk-1);
  border-radius: 0 0.5rem 0.5rem 0;
}

hr { border: 0; border-top: 1px solid var(--border); }

/* Inline code */

code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  padding: 0.125rem 0.375rem;
}

/* Code blocks */

.codeblock { position: relative; }

.codeblock pre {
  background: var(--code-bg);
  color: var(--code-tx);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  overflow-x: auto;
  line-height: 1.6;
}

.codeblock code {
  background: none;
  border: 0;
  padding: 0;
  font-size: 0.8125rem;
  color: inherit;
}

.codeblock .copy {
  position: absolute;
  top: 0.625rem;
  right: 0.625rem;
  font-family: var(--font-sans);
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--code-tx);
  background: color-mix(in srgb, #ffffff 10%, transparent);
  border: 1px solid color-mix(in srgb, #ffffff 15%, transparent);
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}

.codeblock:hover .copy { opacity: 1; }
.codeblock .copy:hover { background: color-mix(in srgb, #ffffff 20%, transparent); }

.tok-kw { color: #ff6030; }
.tok-sql { color: #84adff; font-weight: 500; }
.tok-str { color: #79ffe1; }
.tok-num { color: #d6a8ff; }
.tok-cm { color: #888888; }

/* Tables */

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  display: block;
  overflow-x: auto;
}

th, td {
  text-align: left;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
}

th { color: var(--tx-1); font-weight: 600; }

/* Table of contents */

.toc {
  position: sticky;
  top: var(--topbar-height);
  height: calc(100vh - var(--topbar-height));
  overflow-y: auto;
  padding: 2.5rem 0 2rem;
  font-size: 0.8125rem;
}

.toc-title {
  display: block;
  font-family: var(--font-title);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--tx-1);
  margin-bottom: 0.5rem;
}

.toc a {
  display: block;
  color: var(--tx-3);
  padding: 0.1875rem 0;
}

.toc a:hover { color: var(--lk-1); }
.toc a.toc-3 { padding-left: 0.875rem; }

/* Pager */

.pager {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  max-width: 46rem;
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
}

.pager a {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  font-weight: 500;
  color: var(--tx-1);
  padding: 0.75rem 1rem;
  border: 1px solid var(--border);
  border-radius: 0.625rem;
  min-width: 10rem;
}

.pager a:hover { border-color: var(--lk-1); color: var(--lk-1); }

.pager a span {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--tx-3);
}

.pager-next { align-items: flex-end; text-align: right; margin-left: auto; }

/* Responsive */

@media (max-width: 75rem) {
  .shell { grid-template-columns: 17rem minmax(0, 1fr); }
  .toc { display: none; }
}

@media (max-width: 50rem) {
  .shell { grid-template-columns: minmax(0, 1fr); }
  .sidebar { display: none; }
}
`

// #endregion

// #region Build

async function build(): Promise<void> {
  await mkdir(join(outDir, 'fonts'), {recursive: true})
  const glob = new Bun.Glob('**/*.md')
  const files = (await Array.fromAsync(glob.scan({cwd: docsDir}))).filter(
    file => !file.startsWith('dist')
  )
  for (const file of files) {
    const source = await Bun.file(join(docsDir, file)).text()
    const markdown = rewriteLinks(source)
    const raw = Bun.markdown.html(markdown)
    const {html, headings} = addHeadingIds(raw)
    const content = highlightCodeBlocks(html)
    const outFile = file.replace(/\\/g, '/').replace(/\.md$/, '.html')
    const depth = outFile.split('/').length - 1
    const prefix = '../'.repeat(depth)
    const title =
      headings.find(h => h.level === 1)?.text ??
      source.match(/^#\s+(.+)$/m)?.[1] ??
      siteName
    const page = renderPage({
      title,
      content,
      toc: renderToc(headings),
      current: outFile,
      prefix
    })
    await Bun.write(join(outDir, outFile), page)
  }
  await Bun.write(join(outDir, 'style.css'), styles)
  await Bun.write(join(outDir, 'favicon.svg'), favicon)
  for (const file of fontFiles) {
    const name = file.split('/').at(-1)!
    const source = Bun.file(
      join(docsDir, '..', 'node_modules', ...file.split('/'))
    )
    await Bun.write(join(outDir, 'fonts', name), source)
  }
  console.log(
    `Built ${files.length} pages to ${relative(process.cwd(), outDir)}`
  )
}

await build()

// #endregion

// #region Serve & watch

if (process.argv.includes('--serve')) {
  const server = Bun.serve({
    port: 4000,
    async fetch(request) {
      const url = new URL(request.url)
      let path = decodeURIComponent(url.pathname)
      if (path.endsWith('/')) path += 'index.html'
      const file = Bun.file(join(outDir, path))
      if (await file.exists()) return new Response(file)
      return new Response('Not found', {status: 404})
    }
  })
  console.log(`Serving docs at ${server.url}`)

  let timer: ReturnType<typeof setTimeout> | undefined
  watch(docsDir, {recursive: true}, (_, fileName) => {
    if (!fileName || !fileName.endsWith('.md')) return
    if (fileName.startsWith('dist')) return
    clearTimeout(timer)
    timer = setTimeout(() => build().catch(console.error), 100)
  })
}

// #endregion
