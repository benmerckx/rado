import {spawnSync} from 'node:child_process'
import {readFileSync, writeFileSync} from 'node:fs'

type PackageJson = {
  version?: string
  [key: string]: unknown
}

const input = process.argv[2]
const match = input?.match(
  /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/
)

if (!match) {
  console.error('Usage: bun tag <version>')
  console.error('Example: bun tag 1.3.0-preview.2')
  process.exit(1)
}

const version = match[1]
const tag = `v${version}`
const description = `Release ${tag}`

function readJson(file: string): PackageJson {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function writeJson(file: string, value: PackageJson) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {stdio: 'inherit'})
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function gitQuiet(args: string[]) {
  const result = spawnSync('git', args, {stdio: 'pipe', encoding: 'utf8'})
  if (result.status !== 0 && result.status !== 1) {
    process.stdout.write(result.stdout)
    process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }
  return result.status
}

if (gitQuiet(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`]) === 0) {
  console.error(`Tag already exists: ${tag}`)
  process.exit(1)
}

for (const file of ['package.json', 'jsr.json']) {
  const json = readJson(file)
  json.version = version
  writeJson(file, json)
}

if (gitQuiet(['diff', '--quiet', '--', 'package.json', 'jsr.json']) === 1) {
  run('git', ['commit', '-m', description, '--', 'package.json', 'jsr.json'])
} else {
  console.log('Version files already match; skipping commit.')
}

run('git', ['tag', '-a', tag, '-m', description])
console.log(`Tagged ${tag}`)
