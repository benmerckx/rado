import {suite} from '@alinea/suite'
import {isDeno} from '../TestRuntime.ts'

const test = suite(import.meta)

// The driver tests run in workerd, each result is reported here
if (!isDeno) {
  const {build} = await import('esbuild')
  const {Miniflare} = await import('miniflare')
  const {fileURLToPath} = await import('node:url')
  const worker = fileURLToPath(
    new URL('./durable-object.worker.ts', import.meta.url)
  )
  const {outputFiles} = await build({
    entryPoints: [worker],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    external: ['cloudflare:*', 'node:*']
  })
  const mf = new Miniflare({
    modules: true,
    script: outputFiles[0]!.text,
    compatibilityDate: '2026-06-10',
    compatibilityFlags: ['nodejs_compat'],
    durableObjects: {TEST: {className: 'TestObject', useSQLite: true}}
  })
  const response = await mf.dispatchFetch('http://localhost')
  const results = (await response.json()) as Array<{
    name: string
    error?: string
  }>
  await mf.dispose()
  for (const {name, error} of results)
    test(name, () => {
      if (error) throw new Error(error)
    })
}
